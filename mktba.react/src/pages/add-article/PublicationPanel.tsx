import type { ReactNode } from 'react';
import { useLocale } from '../../localization/hooks';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import { Input } from '../../shared/ui/Input';
import type { SeoDraft } from '../../shared/seo';
import type { ArticleStatus } from '../../shared/types/ApiTypes';
import { SeoFields } from './SeoFields';
import type { SeoSnippet } from './seoSnippet';

const EDIT_COMMENT_MAX_LENGTH = 500;
/** Every article starts as a draft (the API sets it on create). */
const NEW_ARTICLE_STATUS: ArticleStatus = 'Draft';

const labelClass = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

type PublicationPanelProps = {
  /** The status block of a saved article (`ArticleStatusPanel`); absent for a new one, which starts as a draft. */
  status?: ReactNode;
  /** The pre-publication checklist (`PrepublishChecklist`, E-14 #84). */
  checks: ReactNode;
  /** The slug field (`SlugField`). */
  slug: ReactNode;
  /** The revision comment; absent for a new article, whose first save has no revision to describe. */
  editComment?: { value: string; onChange: (value: string) => void };
  seo: SeoDraft;
  onSeoChange: (value: SeoDraft) => void;
  snippet: SeoSnippet;
  url: string;
  disabled?: boolean;
};

/**
 * The editor's «Публикация» block in the right rail (E-12, #82): where the article stands and the
 * moves it may make, its address, the comment for the next revision and the SEO fields with their
 * search-result preview — everything that decides how and when readers get the article.
 */
export const PublicationPanel = ({ status, checks, slug, editComment, seo, onSeoChange, snippet, url, disabled }: PublicationPanelProps) => {
  const locale = useLocale();
  const t = locale.addArticlePage.publication;
  const editT = locale.editArticlePage;

  return (
    <section aria-labelledby="publication-panel-title" data-testid="publication-panel">
      <h2 id="publication-panel-title" className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
        {t.title}
      </h2>
      <div className="space-y-4 rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 shadow-sm">
        {status ?? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">{editT.statusLabel}</span>
              <ArticleStatusBadge status={NEW_ARTICLE_STATUS} />
            </div>
            <p className="mb-0 text-[11px] text-[var(--color-ink-subtle)]">{t.newArticleStatus}</p>
          </div>
        )}
        {checks}
        {slug}
        {editComment ? (
          <div>
            <label htmlFor="edit-comment" className={labelClass}>
              {editT.editCommentLabel}
            </label>
            <Input
              id="edit-comment"
              value={editComment.value}
              disabled={disabled}
              maxLength={EDIT_COMMENT_MAX_LENGTH}
              onChange={(event) => editComment.onChange(event.target.value)}
              placeholder={editT.editCommentPlaceholder}
            />
          </div>
        ) : null}
        <SeoFields value={seo} disabled={disabled} onChange={onSeoChange} snippet={snippet} url={url} />
      </div>
    </section>
  );
};
