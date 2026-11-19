import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, X } from 'lucide-react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { createSource, searchSources } from '../../services/sourceService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { sourceLabel } from '../../shared/articleSources';
import type { SourceDto, SourceKind, SourceWriteDto } from '../../shared/types/ApiTypes';
import { Input } from '../../shared/ui/Input';
import { createCitation } from './draftHelpers';
import type { CitationDraft } from './types';

type OpinionSourcesEditorProps = {
  /** The citations of one opinion, in order. */
  citations: CitationDraft[];
  disabled: boolean;
  onChange: (citations: CitationDraft[]) => void;
};

const SOURCE_KINDS: SourceKind[] = ['Book', 'HadithCollection', 'Quran', 'Other'];
const LOCATOR_MAX_LENGTH = 200;
const emptyDraft: SourceWriteDto = { kind: 'Book', title: '', author: '', details: '', url: '' };

const smallInputClass = 'rounded-lg px-2 py-1 text-[12px]';
const textButtonClass =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-forest)] hover:bg-[var(--color-brand-forest-soft)] disabled:opacity-40';

/**
 * The sources one opinion cites (M-07): the attached ones with their locators, and a panel that
 * attaches an entry of the shared directory or adds a new entry to it. Footnote markers inside the
 * text and a richer picker belong to E-09 (#145).
 */
export const OpinionSourcesEditor = ({ citations, disabled, onChange }: OpinionSourcesEditorProps) => {
  const t = useLocale().addArticleEditor.sources;
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<SourceWriteDto>(emptyDraft);

  const searchQuery = useQuery({
    queryKey: ['sources', 'search', query.trim()],
    queryFn: () => searchSources(query),
    enabled: isOpen,
    placeholderData: keepPreviousData,
  });

  const attach = (source: SourceDto) => onChange([...citations, createCitation(source)]);

  const createMutation = useMutation({
    mutationFn: createSource,
    onSuccess: (created) => {
      attach(created);
      setDraft(emptyDraft);
      setIsCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const updateDraft = (patch: Partial<SourceWriteDto>) => {
    createMutation.reset();
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="mt-2" data-testid="opinion-sources">
      {citations.length > 0 && (
        <ul className="m-0 mb-1 list-none space-y-1 p-0" aria-label={t.title}>
          {citations.map((citation) => (
            <li key={citation.localId} className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-ink-default)]">
              <BookOpen size={12} aria-hidden="true" className="shrink-0 text-[var(--color-ink-subtle)]" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{sourceLabel(citation.source)}</span>
              <Input
                value={citation.locator}
                disabled={disabled}
                maxLength={LOCATOR_MAX_LENGTH}
                aria-label={formatMessage(t.locatorLabel, { title: citation.source.title })}
                placeholder={t.locatorPlaceholder}
                className={`w-40 ${smallInputClass}`}
                onChange={(event) =>
                  onChange(citations.map((c) => (c.localId === citation.localId ? { ...c, locator: event.target.value } : c)))
                }
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={formatMessage(t.remove, { title: citation.source.title })}
                title={formatMessage(t.remove, { title: citation.source.title })}
                className="rounded-lg p-1 text-[var(--color-ink-muted)] hover:bg-white hover:text-red-600 disabled:opacity-30"
                onClick={() => onChange(citations.filter((c) => c.localId !== citation.localId))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        className={textButtonClass}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Plus size={11} aria-hidden="true" />
        {t.add}
      </button>

      {isOpen && (
        <div className="mt-1 space-y-2 rounded-xl border border-[var(--color-border-soft)] bg-white p-2" data-testid="source-picker">
          <Input
            type="search"
            value={query}
            disabled={disabled}
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            className={smallInputClass}
            onChange={(event) => setQuery(event.target.value)}
          />

          {searchQuery.isError && <p className="m-0 text-[11px] text-red-600" role="alert">{extractApiErrorMessage(searchQuery.error)}</p>}
          {searchQuery.data && searchQuery.data.length === 0 && (
            <p className="m-0 text-[11px] text-[var(--color-ink-subtle)]">{t.noResults}</p>
          )}
          {searchQuery.data && searchQuery.data.length > 0 && (
            <ul className="m-0 max-h-48 list-none space-y-0.5 overflow-y-auto p-0" aria-label={t.resultsLabel}>
              {searchQuery.data.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-left text-[12px] hover:bg-[var(--color-brand-forest-soft)] disabled:opacity-40"
                    onClick={() => attach(source)}
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">{sourceLabel(source)}</span>
                    <span className="shrink-0 text-[10px] text-[var(--color-ink-subtle)]">{t.kinds[source.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={disabled}
            aria-expanded={isCreating}
            className={textButtonClass}
            onClick={() => setIsCreating((current) => !current)}
          >
            {t.createToggle}
          </button>

          {isCreating && (
            <div className="grid gap-1.5 sm:grid-cols-2" data-testid="source-create-form">
              <select
                value={draft.kind}
                disabled={disabled}
                aria-label={t.kindLabel}
                className="rounded-lg border border-[var(--color-border-soft)] bg-white px-2 py-1 text-[12px]"
                onChange={(event) => updateDraft({ kind: event.target.value as SourceKind })}
              >
                {SOURCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{t.kinds[kind]}</option>
                ))}
              </select>
              <Input
                value={draft.title}
                disabled={disabled}
                maxLength={300}
                aria-label={t.titleLabel}
                placeholder={t.titleLabel}
                className={smallInputClass}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
              <Input
                value={draft.author ?? ''}
                disabled={disabled}
                maxLength={200}
                aria-label={t.authorLabel}
                placeholder={t.authorLabel}
                className={smallInputClass}
                onChange={(event) => updateDraft({ author: event.target.value })}
              />
              <Input
                value={draft.details ?? ''}
                disabled={disabled}
                maxLength={500}
                aria-label={t.detailsLabel}
                placeholder={t.detailsPlaceholder}
                className={smallInputClass}
                onChange={(event) => updateDraft({ details: event.target.value })}
              />
              <Input
                type="url"
                value={draft.url ?? ''}
                disabled={disabled}
                maxLength={2048}
                aria-label={t.urlLabel}
                placeholder={t.urlPlaceholder}
                className={`sm:col-span-2 ${smallInputClass}`}
                onChange={(event) => updateDraft({ url: event.target.value })}
              />
              {createMutation.isError && (
                <p className="m-0 text-[11px] text-red-600 sm:col-span-2" role="alert">{extractApiErrorMessage(createMutation.error)}</p>
              )}
              <button
                type="button"
                disabled={disabled || createMutation.isPending || !draft.title.trim()}
                className="justify-self-start rounded-lg bg-[var(--color-brand-forest)] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                onClick={() => createMutation.mutate(draft)}
              >
                {t.createSubmit}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
