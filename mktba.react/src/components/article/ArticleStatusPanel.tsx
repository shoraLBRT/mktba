import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateArticleQueries } from '../../app/queryClient';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { changeArticleStatus, getArticleById } from '../../services/adminService';
import { Button } from '../../shared/ui/Button';
import type { ArticleStatus } from '../../shared/types/ApiTypes';
import { ArticleStatusBadge } from './ArticleStatusBadge';

type ArticleStatusPanelProps = {
  articleId: number;
  onChanged: (status: ArticleStatus) => void;
  onError: (message: string) => void;
};

/**
 * The article's status and one button per move the API allows from it. The allowed moves come
 * from the API (`allowedTransitions`), so the transition table lives only on the server.
 */
export const ArticleStatusPanel = ({ articleId, onChanged, onError }: ArticleStatusPanelProps) => {
  const locale = useLocale();
  const t = locale.editArticlePage;
  const queryClient = useQueryClient();

  const articleQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES, articleId],
    queryFn: () => getArticleById(articleId),
  });

  const mutation = useMutation({
    mutationFn: (status: ArticleStatus) => changeArticleStatus(articleId, status),
    onSuccess: async (article) => {
      await invalidateArticleQueries(queryClient);
      onChanged(article.status);
    },
    onError: (error) => onError(`${t.statusChangeError}: ${(error as Error).message}`),
  });

  const article = articleQuery.data;
  if (!article) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="article-status-panel">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">{t.statusLabel}</span>
      <ArticleStatusBadge status={article.status} />
      {article.allowedTransitions.map((target) => (
        <Button
          key={target}
          variant={target === 'Published' ? 'primary' : 'secondary'}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(target)}
          className="h-8 px-3 text-xs"
        >
          {t.statusActions[target]}
        </Button>
      ))}
    </div>
  );
};
