import { Link } from 'react-router';
import MarkdownContent from '../../components/MarkdownContent';
import { formatMessage } from '../../localization';
import { useLanguage, useLocale } from '../../localization/hooks';
import { languageName, useTranslationSource } from './translations';

type TranslationSourcePaneProps = {
  sourceId: number;
  /** The source revision the translation matches, when it is saved. */
  revision?: number;
  onHide: () => void;
};

/**
 * The original beside a translation in the editor (I-06, #110): read only, as the reader sees it
 * — title, summary and every block with all its opinions, the default first — so the translator
 * can follow it block by block.
 */
export const TranslationSourcePane = ({ sourceId, revision, onHide }: TranslationSourcePaneProps) => {
  const locale = useLocale();
  const language = useLanguage();
  const t = locale.articleTranslation.sourcePane;
  const sourceQuery = useTranslationSource(sourceId);
  const source = sourceQuery.data;

  return (
    <aside
      aria-labelledby="translation-source-title"
      data-testid="translation-source-pane"
      className="mb-6 min-w-0 rounded-2xl border border-[var(--color-border-soft)] bg-white p-5 shadow-sm 2xl:sticky 2xl:top-4 2xl:mb-0 2xl:max-h-[calc(100vh-var(--layout-header-height)-2rem)] 2xl:overflow-y-auto"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="translation-source-title" className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
          {t.title}
          {source?.locale ? ` · ${languageName(language, source.locale)}` : ''}
          {revision !== undefined ? ` · ${formatMessage(t.revision, { revision })}` : ''}
        </h2>
        <div className="flex items-center gap-3 text-[12px]">
          <Link to={`/admin/articles/${sourceId}/edit`} className="text-[var(--color-brand-forest)] hover:underline">
            {t.open}
          </Link>
          <button type="button" onClick={onHide} className="text-[var(--color-ink-muted)] hover:underline">
            {t.hide}
          </button>
        </div>
      </div>
      {sourceQuery.isLoading ? <p className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p> : null}
      {sourceQuery.isError ? <p className="text-sm text-red-600">{t.loadError}</p> : null}
      {source ? (
        <div lang={source.locale ?? undefined} className="space-y-4">
          <h3 className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{source.title}</h3>
          {source.summary ? <p className="m-0 text-sm italic text-[var(--color-ink-muted)]">{source.summary}</p> : null}
          {source.paragraphs.map((paragraph) => (
            <div key={paragraph.id} className="space-y-2 border-t border-[var(--color-border-soft)] pt-3">
              {[...paragraph.opinions]
                .sort((first, second) => Number(second.isDefault) - Number(first.isDefault))
                .map((opinion) => (
                  <div key={opinion.id} className="article-markdown text-[14px] leading-7 text-[var(--color-ink-default)]">
                    <MarkdownContent content={opinion.content} />
                  </div>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
};
