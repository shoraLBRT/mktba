import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { cn } from '../../shared/lib/cn';
import { TAB_KEY_STEPS } from '../../shared/tabKeys';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { canAssignSchools, opinionTabLabel, uncoveredSchools } from './draftHelpers';
import { OpinionSourcesEditor } from './OpinionSourcesEditor';
import { RichTextEditor, type RichTextHandle } from './richText/RichTextEditor';
import type { AlternativeDraft, CitationDraft, VersionedEditorBlock } from './types';

type EditorTarget = {
  blockId: string;
  localId: string | null;
};

const getDefaultVariant = (variants: AlternativeDraft[]) =>
  variants.find((variant) => variant.isDefault) ?? variants[0];

/**
 * «+ Мазхаб»: a menu of the schools no opinion of the block covers yet; picking one adds an
 * opinion for it. The last item adds an opinion without a school.
 */
const AddOpinionMenu = ({
  schools,
  disabled,
  onAdd,
}: {
  schools: SchoolDto[];
  disabled: boolean;
  onAdd: (schoolId: number | null) => void;
}) => {
  const t = useLocale().addArticleEditor;
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const items: Array<{ key: string; label: string; schoolId: number | null }> = [
    ...schools.map((school) => ({ key: `school-${school.id}`, label: school.name, schoolId: school.id })),
    { key: 'no-school', label: t.addOpinionMenu.noSchool, schoolId: null },
  ];

  useEffect(() => {
    if (open) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const step = TAB_KEY_STEPS[event.key];
    if (step && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      event.preventDefault();
      setActiveIndex(step(index, items.length));
    }
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.addOpinionMenu.button}
        title={t.addOpinionMenu.button}
        onClick={() => (open ? setOpen(false) : openAt(0))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openAt(event.key === 'ArrowDown' ? 0 : items.length - 1);
          }
        }}
        className="inline-flex items-center gap-0.5 rounded border border-[#cfe3d6] bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-brand-forest)] transition-colors hover:bg-[var(--color-brand-forest-soft)] disabled:opacity-40"
      >
        <Plus size={11} aria-hidden="true" />
        {t.addVersion}
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={t.addOpinionMenu.button}
          className="absolute right-0 top-full z-20 m-0 mt-1 min-w-[220px] list-none rounded-xl border border-[var(--color-border-soft)] bg-white p-1 shadow-lg"
        >
          {schools.length === 0 ? (
            <li role="none">
              <button type="button" role="menuitem" disabled aria-disabled="true" className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-ink-subtle)]">
                {t.addOpinionMenu.allCovered}
              </button>
            </li>
          ) : null}
          {items.map((item, index) => (
            <li key={item.key} role="none">
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
                onClick={() => {
                  setOpen(false);
                  onAdd(item.schoolId);
                }}
                className={cn(
                  'w-full rounded-lg px-3 py-1.5 text-left text-[12px] text-[var(--color-ink-strong)] hover:bg-[var(--color-brand-forest-soft)] focus:bg-[var(--color-brand-forest-soft)] focus:outline-none',
                  item.schoolId === null && 'text-[var(--color-ink-muted)]',
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

/**
 * The schools of the opinion on screen, as toggles. A school another opinion of the block has is
 * drawn dashed; picking it here moves it (`toggleOpinionSchool`).
 */
const SchoolChips = ({
  label,
  availableSchools,
  variant,
  variants,
  opinionLabel,
  disabled,
  onToggle,
}: {
  label: string;
  availableSchools: SchoolDto[];
  variant: AlternativeDraft;
  variants: AlternativeDraft[];
  opinionLabel: (variant: AlternativeDraft) => string;
  disabled: boolean;
  onToggle: (schoolId: number) => void;
}) => {
  const t = useLocale().addArticleEditor;
  if (availableSchools.length === 0) return null;

  return (
    <div role="group" aria-label={label} className="mt-2 flex flex-wrap items-center gap-1">
      {availableSchools.map((school) => {
        const isSelected = variant.schoolIds.includes(school.id);
        const owner = isSelected
          ? undefined
          : variants.find((other) => other.localId !== variant.localId && other.schoolIds.includes(school.id));
        return (
          <button
            key={school.id}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onToggle(school.id)}
            title={owner ? formatMessage(t.schoolTakenTitle, { school: school.name, opinion: opinionLabel(owner) }) : school.name}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40',
              owner && 'border-dashed',
            )}
            style={{
              backgroundColor: isSelected ? 'var(--color-brand-forest)' : 'white',
              color: isSelected ? 'white' : owner ? 'var(--color-ink-subtle)' : 'var(--color-brand-forest)',
              borderColor: isSelected ? 'var(--color-brand-forest)' : '#cfe3d6',
            }}
          >
            {school.shortName}
          </button>
        );
      })}
    </div>
  );
};

type OpinionBlockEditorProps = {
  block: VersionedEditorBlock;
  disabled: boolean;
  activeTarget: EditorTarget | null;
  availableSchools: SchoolDto[];
  richTextRef: (targetKey: string, handle: RichTextHandle | null) => void;
  targetKey: (blockId: string, localId: string | null) => string;
  onFocusTarget: (target: EditorTarget) => void;
  onRequestLink: (target: EditorTarget) => void;
  onImageFile: (target: EditorTarget, file: File) => void;
  onChangeVersion: (blockId: string, localId: string, content: string) => void;
  onSetDefault: (blockId: string, localId: string) => void;
  onToggleSchool: (blockId: string, localId: string, schoolId: number) => void;
  onSetSources: (blockId: string, localId: string | null, sources: CitationDraft[]) => void;
  onAddOpinion: (blockId: string, schoolId: number | null) => void;
  onRemoveVersion: (blockId: string, localId: string) => void;
};

/**
 * A block of opinions in the editor (E-06): one tab per opinion named by its schools, the opinion
 * on screen below them, «+ Мазхаб» to add an opinion for a school no opinion covers yet, and a hint
 * naming the schools whose readers get the default opinion.
 */
export const OpinionBlockEditor = ({
  block,
  disabled,
  activeTarget,
  availableSchools,
  richTextRef,
  targetKey,
  onFocusTarget,
  onRequestLink,
  onImageFile,
  onChangeVersion,
  onSetDefault,
  onToggleSchool,
  onSetSources,
  onAddOpinion,
  onRemoveVersion,
}: OpinionBlockEditorProps) => {
  const t = useLocale().addArticleEditor;
  const idPrefix = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (index: number) => `${idPrefix}-tab-${index}`;
  const panelId = `${idPrefix}-panel`;
  const labelId = `${idPrefix}-label`;

  const selectedVariant =
    block.variants.find((variant) => activeTarget?.blockId === block.id && activeTarget.localId === variant.localId) ??
    getDefaultVariant(block.variants);
  const selectedIndex = block.variants.findIndex((variant) => variant.localId === selectedVariant.localId);
  const labelOf = (variant: AlternativeDraft) => opinionTabLabel(variant, availableSchools, t.opinionTab);
  const selectedLabel = labelOf(selectedVariant);
  const schoolsAssignable = canAssignSchools(block);
  const uncovered = uncoveredSchools(block, availableSchools);

  const selectTab = (index: number) => onFocusTarget({ blockId: block.id, localId: block.variants[index].localId });

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = TAB_KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const nextIndex = step(index, block.variants.length);
    selectTab(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="rounded-xl border border-[#d9ecdf] bg-[#f7fcf9] px-4 py-3 transition-colors">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span id={labelId} className="mr-1 text-[10px] text-[var(--color-ink-subtle)]">{t.versions}</span>
        <div role="tablist" aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5">
          {block.variants.map((variant, index) => {
            const isActive = index === selectedIndex;
            return (
              <button
                key={variant.localId}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                disabled={disabled}
                onClick={() => selectTab(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                title={variant.isDefault ? t.defaultVersionHint : undefined}
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
                style={{
                  backgroundColor: isActive
                    ? 'var(--color-brand-forest)'
                    : variant.isDefault
                      ? 'var(--color-brand-forest-soft)'
                      : 'white',
                  color: isActive ? 'white' : 'var(--color-brand-forest)',
                  borderColor: isActive || variant.isDefault ? 'var(--color-brand-forest)' : '#cfe3d6',
                }}
              >
                {variant.isDefault ? <Star size={10} aria-hidden="true" className="fill-current" /> : null}
                {labelOf(variant)}
                {variant.isDefault ? <span className="sr-only">{t.opinionTab.defaultMark}</span> : null}
              </button>
            );
          })}
        </div>
        <AddOpinionMenu schools={uncovered} disabled={disabled} onAdd={(schoolId) => onAddOpinion(block.id, schoolId)} />
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(selectedIndex)}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={selectedVariant.isDefault}
            onClick={() => onSetDefault(block.id, selectedVariant.localId)}
            title={t.defaultVersionHint}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
            style={{
              backgroundColor: selectedVariant.isDefault ? 'var(--color-brand-forest-soft)' : 'white',
              color: 'var(--color-brand-forest)',
              borderColor: selectedVariant.isDefault ? 'var(--color-brand-forest)' : '#cfe3d6',
            }}
          >
            <Star size={11} aria-hidden="true" className={selectedVariant.isDefault ? 'fill-current' : ''} />
            {t.defaultVersion}
          </button>
          <button
            type="button"
            disabled={disabled || block.variants.length <= 1}
            onClick={() => {
              const nextVariant = block.variants[selectedIndex + 1] ?? block.variants[selectedIndex - 1];
              if (nextVariant) {
                onFocusTarget({ blockId: block.id, localId: nextVariant.localId });
              }
              onRemoveVersion(block.id, selectedVariant.localId);
            }}
            title={formatMessage(t.removeVersion, { label: selectedLabel })}
            aria-label={formatMessage(t.removeVersion, { label: selectedLabel })}
            className="rounded-lg p-2 text-[var(--color-ink-muted)] hover:bg-white hover:text-red-600 disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
        </div>

        <RichTextEditor
          // One editor per opinion, so each keeps its own undo history.
          key={selectedVariant.localId}
          handleRef={(handle) => richTextRef(targetKey(block.id, selectedVariant.localId), handle)}
          value={selectedVariant.content}
          disabled={disabled}
          onFocus={() => onFocusTarget({ blockId: block.id, localId: selectedVariant.localId })}
          onRequestLink={() => onRequestLink({ blockId: block.id, localId: selectedVariant.localId })}
          onImageFile={(file) => onImageFile({ blockId: block.id, localId: selectedVariant.localId }, file)}
          onChange={(content) => onChangeVersion(block.id, selectedVariant.localId, content)}
          className="py-1 text-[14px]"
          placeholder={formatMessage(t.versionTextPlaceholder, { label: selectedLabel })}
        />

        {schoolsAssignable ? (
          <SchoolChips
            label={formatMessage(t.opinionSchools, { label: selectedLabel })}
            availableSchools={availableSchools}
            variant={selectedVariant}
            variants={block.variants}
            opinionLabel={labelOf}
            disabled={disabled}
            onToggle={(schoolId) => onToggleSchool(block.id, selectedVariant.localId, schoolId)}
          />
        ) : (
          <p className="mt-2 text-[10px] text-[var(--color-ink-subtle)]">{t.schoolsNeedSecondVersion}</p>
        )}

        <OpinionSourcesEditor
          key={selectedVariant.localId}
          citations={selectedVariant.sources ?? []}
          disabled={disabled}
          onChange={(sources) => onSetSources(block.id, selectedVariant.localId, sources)}
        />
      </div>

      {schoolsAssignable && uncovered.length > 0 ? (
        <p data-testid="uncovered-schools" className="mt-2 text-[11px] text-[var(--color-ink-muted)]">
          {formatMessage(t.uncoveredSchools, { schools: uncovered.map((school) => school.name).join(', ') })}
        </p>
      ) : null}
    </div>
  );
};
