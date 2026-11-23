import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useLanguage, useLocale } from '../../localization/hooks';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import { Button } from '../../shared/ui/Button';
import type { ArticleContentDto } from '../../shared/types/ApiTypes';
import type { TranslationTarget } from './articleDraft';
import { languageName, missingTranslationLocales, newTranslationPath, useTranslationSource } from './translations';

const labelClass = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

type TranslationsPanelProps =
  | { kind: 'create'; translation?: TranslationTarget }
  | {
      kind: 'edit';
      article: ArticleContentDto;
      /** The source revision the draft matches; above the saved one once marked up to date. */
      draftRevision: number | null;
      onMarkUpToDate: (revision: number) => void;
      disabled?: boolean;
    };

/**
 * The editor's «Переводы» block (I-06, #110): which article a translation is made from and whether
 * that article has changed since, the other language versions, and links to start a missing one.
 */
export const TranslationsPanel = (props: TranslationsPanelProps) => {
  const locale = useLocale();
  const language = useLanguage();
  const t = locale.articleTranslation;
  const sourceId = props.kind === 'create' ? props.translation?.sourceId ?? null : props.article.translatedFrom?.articleId ?? null;
  const sourceQuery = useTranslationSource(props.kind === 'create' ? sourceId : null);

  return (
    <section aria-labelledby="translations-panel-title" data-testid="translations-panel">
      <h2 id="translations-panel-title" className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
        {t.title}
      </h2>
      <div className="space-y-4 rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 text-sm shadow-sm">
        {props.kind === 'create' ? (
          props.translation ? (
            <div>
              <span className={labelClass}>{t.sourceLabel}</span>
              {sourceQuery.data ? (
                <Link to={`/admin/articles/${sourceQuery.data.id}/edit`} className="font-medium text-[var(--color-brand-forest)] hover:underline">
                  {sourceQuery.data.title}
                </Link>
              ) : null}
              <p className="mb-0 mt-1 text-[12px] text-[var(--color-ink-muted)]">
                {formatMessage(t.newTranslation, { language: languageName(language, props.translation.locale) })}
              </p>
            </div>
          ) : (
            <p className="mb-0 text-[12px] text-[var(--color-ink-muted)]">{t.afterFirstSave}</p>
          )
        ) : (
          <EditTranslations {...props} />
        )}
      </div>
    </section>
  );
};

const EditTranslations = ({
  article,
  draftRevision,
  onMarkUpToDate,
  disabled,
}: Extract<TranslationsPanelProps, { kind: 'edit' }>) => {
  const locale = useLocale();
  const language = useLanguage();
  const t = locale.articleTranslation;
  const source = article.translatedFrom;
  const translations = article.translations ?? [];
  const missing = missingTranslationLocales(article.locale ?? 'ru', translations);
  const marked = source != null && draftRevision !== null && draftRevision > source.revision;
  const outdated = source != null && source.isOutdated && !marked;

  return (
    <>
      {source ? (
        <div data-testid="translation-source">
          <span className={labelClass}>{t.sourceLabel}</span>
          <Link to={`/admin/articles/${source.articleId}/edit`} className="font-medium text-[var(--color-brand-forest)] hover:underline">
            {source.title}
          </Link>{' '}
          <span className="text-[12px] text-[var(--color-ink-subtle)]">({languageName(language, source.locale)})</span>
          {outdated ? (
            <div role="status" className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <p className="mb-0">{formatMessage(t.outdated, { revision: source.revision, latest: source.latestRevision })}</p>
              <Button disabled={disabled} onClick={() => onMarkUpToDate(source.latestRevision)}>
                {formatMessage(t.markUpToDate, { latest: source.latestRevision })}
              </Button>
            </div>
          ) : (
            <p className="mb-0 mt-1 text-[12px] text-[var(--color-ink-muted)]">
              {marked ? t.markedUpToDate : formatMessage(t.upToDate, { revision: source.revision })}
            </p>
          )}
        </div>
      ) : null}
      {translations.length > 0 ? (
        <div>
          <span className={labelClass}>{t.versions}</span>
          <ul className="m-0 list-none space-y-1 p-0">
            {translations.map((translation) => (
              <li key={translation.articleId} className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-[var(--color-ink-subtle)]">{languageName(language, translation.locale)}</span>
                <Link to={`/admin/articles/${translation.articleId}/edit`} className="text-[var(--color-brand-forest)] hover:underline">
                  {translation.title}
                </Link>
                <ArticleStatusBadge status={translation.status} compact />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {missing.length > 0 ? (
        <ul className="m-0 list-none space-y-1 p-0">
          {missing.map((code) => (
            <li key={code}>
              <Link to={newTranslationPath(article.id, code)} className="text-[var(--color-brand-forest)] hover:underline">
                {formatMessage(t.translateInto, { language: languageName(language, code) })}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
};
