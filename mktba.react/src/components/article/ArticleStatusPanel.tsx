import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateArticleQueries } from '../../app/queryClient';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { changeArticleStatus, getArticleById } from '../../services/adminService';
import { Button } from '../../shared/ui/Button';
import type { ArticleReadDto, ArticleStatus } from '../../shared/types/ApiTypes';
import { ArticleStatusBadge } from './ArticleStatusBadge';

type ArticleStatusPanelProps = {
  articleId: number;
  onChanged: (status: ArticleStatus) => void;
  onError: (message: string) => void;
  /**
   * The editor holds edits not saved yet: each move is labelled «Сохранить и …» and
   * `beforeChange` runs first.
   */
  hasUnsavedChanges?: boolean;
  /**
   * Runs before the status moves to `target` (the editor confirms its pre-publication warnings
   * and saves its edits there); the move is made only when it resolves to true, so a cancelled
   * confirmation or a save that fails or is refused leaves the status as it was.
   */
  beforeChange?: (target: ArticleStatus) => Promise<boolean>;
  disabled?: boolean;
};

const returnedAt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

/**
 * The reviewer's comment while a returned article is a draft again (A-04, #87): the latest move was
 * InReview → Draft and came with a comment. Plain text, as typed.
 */
const ReturnedForRevisionNote = ({ article }: { article: ArticleReadDto }) => {
  const t = useLocale().editArticlePage;
  const change = article.lastStatusChange;
  if (article.status !== 'Draft' || !change || change.fromStatus !== 'InReview' || change.toStatus !== 'Draft' || !change.comment) {
    return null;
  }

  const date = returnedAt.format(new Date(change.changedAt));
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="returned-for-revision">
      <p className="m-0 font-semibold">{t.returnedTitle}</p>
      <p className="m-0 text-[11px] text-amber-800">
        {change.changedByDisplayName ? formatMessage(t.returnedBy, { name: change.changedByDisplayName, date }) : date}
      </p>
      <p className="mb-0 mt-1 whitespace-pre-wrap">{change.comment}</p>
    </div>
  );
};

/**
 * The article's status, what it means and one button per move the API allows from it. The allowed
 * moves come from the API (`allowedTransitions`, already narrowed to what the signed-in user may
 * do: an author only submits a draft and takes it back), so the transition table lives only on the
 * server.
 */
export const ArticleStatusPanel = ({
  articleId,
  onChanged,
  onError,
  hasUnsavedChanges = false,
  beforeChange,
  disabled = false,
}: ArticleStatusPanelProps) => {
  const locale = useLocale();
  const t = locale.editArticlePage;
  const publication = locale.addArticlePage.publication;
  const queryClient = useQueryClient();

  const articleQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES, articleId],
    queryFn: () => getArticleById(articleId),
  });

  const mutation = useMutation({
    mutationFn: async (status: ArticleStatus): Promise<ArticleStatus | null> => {
      if (beforeChange && !(await beforeChange(status))) {
        return null;
      }
      return (await changeArticleStatus(articleId, status)).status;
    },
    onSuccess: async (status) => {
      if (status === null) {
        return;
      }
      await invalidateArticleQueries(queryClient);
      onChanged(status);
    },
    onError: (error) => onError(`${t.statusChangeError}: ${(error as Error).message}`),
  });

  const article = articleQuery.data;
  if (!article) {
    return null;
  }

  const labels = hasUnsavedChanges ? publication.saveAndMove : t.statusActions;

  return (
    <div className="space-y-2" data-testid="article-status-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">{t.statusLabel}</span>
        <ArticleStatusBadge status={article.status} />
      </div>
      <p className="mb-0 text-[11px] text-[var(--color-ink-subtle)]">{publication.statusHints[article.status]}</p>
      <ReturnedForRevisionNote article={article} />
      {article.allowedTransitions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {article.allowedTransitions.map((target) => (
            <Button
              key={target}
              variant={target === 'Published' ? 'primary' : 'secondary'}
              disabled={disabled || mutation.isPending}
              onClick={() => mutation.mutate(target)}
              className="h-auto min-h-8 px-3 py-1 text-xs"
            >
              {labels[target]}
            </Button>
          ))}
        </div>
      ) : null}
      {hasUnsavedChanges && article.allowedTransitions.length > 0 ? (
        <p className="mb-0 text-[11px] text-amber-700">{publication.unsavedHint}</p>
      ) : null}
    </div>
  );
};
