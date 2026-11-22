import { AlertTriangle } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import { formatMessage } from '../../localization';
import type { ArticleLinkTarget, BrokenInternalLink } from './internalLinks';

type InternalLinkWarningsProps = {
  links: BrokenInternalLink[];
  articles: ArticleLinkTarget[];
  onJumpToBlock: (blockId: string) => void;
};

/** The internal links of the draft that lead nowhere a reader can open. Saving is never blocked. */
export const InternalLinkWarnings = ({ links, articles, onJumpToBlock }: InternalLinkWarningsProps) => {
  const t = useLocale().addArticleEditor.internalLinks;
  if (links.length === 0) return null;

  const titleBySlug = new Map(articles.map((article) => [article.slug, article.title]));

  return (
    <section
      aria-labelledby="internal-link-warnings-title"
      className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <h2 id="internal-link-warnings-title" className="m-0 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={14} aria-hidden="true" />
        {t.warningsTitle}
      </h2>
      <ul className="mb-2 mt-2 space-y-1.5 ps-0">
        {links.map((link) => (
          <li key={`${link.blockId}:${link.slug}`} className="flex list-none items-start justify-between gap-3">
            <span className="min-w-0 break-words">
              {formatMessage(t[link.problem], { slug: link.slug, title: titleBySlug.get(link.slug) ?? '' })}
            </span>
            <button
              type="button"
              onClick={() => onJumpToBlock(link.blockId)}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium underline hover:bg-amber-100"
            >
              {t.jumpToBlock}
            </button>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-amber-800">{t.warningsHint}</p>
    </section>
  );
};
