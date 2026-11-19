import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { getArticleAuthors, getUsers, setArticleAuthors } from '../../services/adminService';
import { Button } from '../../shared/ui/Button';
import type { ArticleAuthorsDto, UserSummaryDto } from '../../shared/types/ApiTypes';

type ArticleAuthorsPanelProps = {
  articleId: number;
  onSaved: () => void;
  onError: (message: string) => void;
};

const labelClass = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

/**
 * The article's author and co-authors, chosen from existing users. The author is never offered
 * as a co-author, so the API's "author is not a co-author" rule cannot be broken from here.
 */
export const ArticleAuthorsPanel = ({ articleId, onSaved, onError }: ArticleAuthorsPanelProps) => {
  const usersQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_USERS], queryFn: getUsers });
  const authorsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_AUTHORS, articleId],
    queryFn: () => getArticleAuthors(articleId),
  });

  if (!usersQuery.data || !authorsQuery.data) {
    return null;
  }

  return (
    <AuthorsForm
      key={authorsQuery.dataUpdatedAt}
      articleId={articleId}
      users={usersQuery.data}
      saved={authorsQuery.data}
      onSaved={onSaved}
      onError={onError}
    />
  );
};

type AuthorsFormProps = ArticleAuthorsPanelProps & {
  users: UserSummaryDto[];
  saved: ArticleAuthorsDto;
};

const AuthorsForm = ({ articleId, users, saved, onSaved, onError }: AuthorsFormProps) => {
  const t = useLocale().editArticlePage;
  const queryClient = useQueryClient();
  const [authorId, setAuthorId] = useState<number | null>(saved.authorId ?? null);
  const [coAuthorIds, setCoAuthorIds] = useState<number[]>(saved.coAuthorIds);

  const mutation = useMutation({
    mutationFn: () => setArticleAuthors(articleId, { authorId, coAuthorIds: coAuthorIds.filter((id) => id !== authorId) }),
    onSuccess: (result) => {
      queryClient.setQueryData([APP_CONSTANTS.QUERY_KEYS.ARTICLE_AUTHORS, articleId], result);
      onSaved();
    },
    onError: (error) => onError(`${t.authorsSaveError}: ${(error as Error).message}`),
  });

  const coAuthorCandidates = users.filter((user) => user.id !== authorId);
  const toggleCoAuthor = (id: number) =>
    setCoAuthorIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));

  return (
    <fieldset className="space-y-3" data-testid="article-authors-panel">
      <legend className={labelClass}>{t.authorsTitle}</legend>
      <div>
        <label htmlFor="article-author" className={labelClass}>
          {t.authorLabel}
        </label>
        <select
          id="article-author"
          value={authorId ?? ''}
          onChange={(event) => setAuthorId(event.target.value ? Number(event.target.value) : null)}
          className="h-9 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
        >
          <option value="">{t.noAuthor}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className={labelClass}>{t.coAuthorsLabel}</span>
        {coAuthorCandidates.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-subtle)]">{t.noOtherUsers}</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {coAuthorCandidates.map((user) => (
              <label key={user.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={coAuthorIds.includes(user.id)} onChange={() => toggleCoAuthor(user.id)} />
                {user.email}
              </label>
            ))}
          </div>
        )}
      </div>
      <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()} className="h-8 px-3 text-xs">
        {t.saveAuthors}
      </Button>
    </fieldset>
  );
};
