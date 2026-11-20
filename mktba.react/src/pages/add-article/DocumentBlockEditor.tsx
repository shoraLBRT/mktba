import { useLayoutEffect, useRef, useState, type DragEvent, type TextareaHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, Copy, GitBranch, GripVertical, Pilcrow, Plus, Star, Trash2 } from 'lucide-react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { cn } from '../../shared/lib/cn';
import { Textarea } from '../../shared/ui/Textarea';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { canAssignSchools, type BlockDropPosition } from './draftHelpers';
import { OpinionSourcesEditor } from './OpinionSourcesEditor';
import { RichTextEditor, type RichTextHandle } from './richText/RichTextEditor';
import { SlashMenu } from './SlashMenu';
import { filterSlashMenuKinds, slashMenuQuery, type SlashMenuKind } from './slashMenuKinds';
import type { AlternativeDraft, CitationDraft, EditorBlock } from './types';

type EditorTarget = {
  blockId: string;
  localId: string | null;
};

type DocumentBlockEditorProps = {
  block: EditorBlock;
  index: number;
  total: number;
  disabled: boolean;
  activeTarget: EditorTarget | null;
  availableSchools: SchoolDto[];
  blockRef: (blockId: string, node: HTMLElement | null) => void;
  /** A heading's textarea. */
  editorRef: (targetKey: string, node: HTMLTextAreaElement | null) => void;
  /** The rich-text editor of a paragraph or of an opinion. */
  richTextRef: (targetKey: string, handle: RichTextHandle | null) => void;
  onFocusTarget: (target: EditorTarget) => void;
  /** Ctrl/⌘+K in a rich text: the page opens its link dialog for that text. */
  onRequestLink: (target: EditorTarget) => void;
  onChangePlain: (blockId: string, content: string) => void;
  onChangeVersion: (blockId: string, localId: string, content: string) => void;
  onSetDefault: (blockId: string, localId: string) => void;
  onSetSchools: (blockId: string, localId: string, schoolIds: number[]) => void;
  /** Replaces the citations of a version, or of a plain paragraph when `localId` is null. */
  onSetSources: (blockId: string, localId: string | null, sources: CitationDraft[]) => void;
  onAddVersion: (blockId: string) => void;
  onRemoveVersion: (blockId: string, localId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onConvertToVersioned: (blockId: string) => void;
  onConvertToParagraph: (blockId: string) => void;
  /** A kind picked in the `/` menu of an empty paragraph. */
  onChooseBlockKind: (blockId: string, kind: SlashMenuKind) => void;
  /** Drag and drop (`useBlockDragAndDrop`): the handle's and the block's event props. */
  dragHandleProps: {
    draggable: true;
    onDragStart: (event: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
  dropZoneProps: {
    onDragOverCapture: (event: DragEvent<HTMLElement>) => void;
    onDropCapture: (event: DragEvent<HTMLElement>) => void;
  };
  isDragged: boolean;
  /** Where the dragged block would land next to this one, or null. */
  dropIndicator: BlockDropPosition | null;
};

const iconButtonClasses = 'rounded-lg p-1.5 text-[var(--color-ink-muted)] hover:bg-white disabled:opacity-30';

/**
 * The `/` menu of an empty paragraph: open while the paragraph holds `/` and a word that matches a
 * kind, until Escape closes it for that text. Takes the arrows, Enter, Tab and Escape from the text.
 */
const useSlashMenu = (content: string | null, onChoose: (kind: SlashMenuKind) => void, labels: Record<SlashMenuKind, string>) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [queryOfIndex, setQueryOfIndex] = useState<string | null>(null);
  const query = content === null ? null : slashMenuQuery(content);
  const kinds = query === null || content === dismissedFor ? [] : filterSlashMenuKinds(query, labels);
  // A new query starts at the first match (state adjusted during render, as React recommends).
  if (query !== queryOfIndex) {
    setQueryOfIndex(query);
    setActiveIndex(0);
  }
  const index = Math.min(activeIndex, Math.max(0, kinds.length - 1));

  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (kinds.length === 0 || event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    switch (event.key) {
      case 'ArrowDown':
        setActiveIndex((index + 1) % kinds.length);
        return true;
      case 'ArrowUp':
        setActiveIndex((index - 1 + kinds.length) % kinds.length);
        return true;
      case 'Enter':
      case 'Tab':
        onChoose(kinds[index]);
        return true;
      case 'Escape':
        setDismissedFor(content);
        return true;
      default:
        return false;
    }
  };

  return { kinds, activeIndex: index, onKeyDown };
};

const targetKey = (blockId: string, localId: string | null) => `${blockId}:${localId ?? 'plain'}`;

const getDefaultVariant = (variants: AlternativeDraft[]) =>
  variants.find((variant) => variant.isDefault) ?? variants[0];

type AutoResizingTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  textareaRef: (node: HTMLTextAreaElement | null) => void;
};

const AutoResizingTextarea = ({ textareaRef, className, value, ...props }: AutoResizingTextareaProps) => {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = localRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={(node) => {
        localRef.current = node;
        textareaRef(node);
      }}
      rows={1}
      value={value}
      className={cn('resize-none overflow-hidden', className)}
    />
  );
};

const SchoolChips = ({
  availableSchools,
  selectedSchoolIds,
  disabled,
  onToggle,
}: {
  availableSchools: SchoolDto[];
  selectedSchoolIds: number[];
  disabled: boolean;
  onToggle: (schoolId: number) => void;
}) => {
  if (availableSchools.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {availableSchools.map((school) => {
        const isSelected = selectedSchoolIds.includes(school.id);
        return (
          <button
            key={school.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(school.id)}
            title={school.name}
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40"
            style={{
              backgroundColor: isSelected ? 'var(--color-brand-forest)' : 'white',
              color: isSelected ? 'white' : 'var(--color-brand-forest)',
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

export const DocumentBlockEditor = ({
  block,
  index,
  total,
  disabled,
  activeTarget,
  availableSchools,
  blockRef,
  editorRef,
  richTextRef,
  onFocusTarget,
  onRequestLink,
  onChangePlain,
  onChangeVersion,
  onSetDefault,
  onSetSchools,
  onSetSources,
  onAddVersion,
  onRemoveVersion,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  onConvertToVersioned,
  onConvertToParagraph,
  onChooseBlockKind,
  dragHandleProps,
  dropZoneProps,
  isDragged,
  dropIndicator,
}: DocumentBlockEditorProps) => {
  const locale = useLocale();
  const t = locale.addArticleEditor;
  const gripRef = useRef<HTMLButtonElement | null>(null);
  const isPlainTextFocused = activeTarget?.blockId === block.id && activeTarget.localId === null;
  const slashMenu = useSlashMenu(
    block.kind === 'paragraph' && isPlainTextFocused ? block.content : null,
    (kind) => onChooseBlockKind(block.id, kind),
    t.slashMenu.kinds,
  );
  const slashMenuId = `slash-menu-${block.id}`;
  const headingClasses =
    block.kind === 'heading2'
      ? 'min-h-[36px] text-[24px] font-bold tracking-[-0.03em]'
      : 'min-h-[30px] text-[18px] font-semibold';

  const blockKindLabel =
    block.kind === 'heading2'
      ? t.blockKinds.heading2
      : block.kind === 'heading3'
        ? t.blockKinds.heading3
        : block.kind === 'versioned'
          ? t.blockKinds.versioned
          : t.blockKinds.paragraph;

  return (
    <section
      ref={(node) => blockRef(block.id, node)}
      data-drop-indicator={dropIndicator ?? undefined}
      {...dropZoneProps}
      className={cn(
        'group relative rounded-[24px] border border-transparent px-5 py-2.5 transition-colors hover:border-[var(--color-border-soft)] hover:bg-[rgba(250,250,248,0.65)]',
        isDragged && 'opacity-40',
      )}
    >
      {dropIndicator ? (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-5 h-0.5 rounded-full bg-[var(--color-brand-forest)]',
            dropIndicator === 'before' ? '-top-px' : '-bottom-px',
          )}
        />
      ) : null}
      <div className="mb-0.5 flex min-h-0 items-start justify-between gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <div className="flex min-h-0 items-center gap-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-subtle)]">
          <button
            ref={gripRef}
            type="button"
            disabled={disabled}
            {...dragHandleProps}
            draggable={!disabled}
            onKeyDown={(event) => {
              const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
              if (direction === 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
              }
              event.preventDefault();
              onMoveBlock(block.id, direction);
              // The block's node moves in the page, which may take the focus away from the handle.
              requestAnimationFrame(() => gripRef.current?.focus());
            }}
            className="-ml-1 cursor-grab rounded p-0.5 text-[var(--color-ink-subtle)] hover:bg-white hover:text-[var(--color-ink-strong)] active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
            title={formatMessage(t.blockActions.drag, { index: index + 1, total })}
            aria-label={formatMessage(t.blockActions.drag, { index: index + 1, total })}
          >
            <GripVertical size={14} />
          </button>
          {block.kind === 'versioned' ? <GitBranch size={12} /> : null}
          <span>{blockKindLabel}</span>
        </div>
        <div className="flex items-center gap-1 py-0">
          {block.kind === 'paragraph' ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onConvertToVersioned(block.id)}
              className="rounded-lg p-1.5 text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-ink-strong)] disabled:opacity-30"
              title={t.toggleToVersioned}
              aria-label={t.toggleToVersioned}
            >
              <GitBranch size={14} />
            </button>
          ) : null}
          {block.kind === 'versioned' ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onConvertToParagraph(block.id)}
              className="rounded-lg p-1.5 text-[var(--color-ink-muted)] hover:bg-white hover:text-[var(--color-ink-strong)] disabled:opacity-30"
              title={t.toggleToParagraph}
              aria-label={t.toggleToParagraph}
            >
              <Pilcrow size={14} />
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || index === 0}
            onClick={() => onMoveBlock(block.id, -1)}
            className={iconButtonClasses}
            title={t.blockActions.moveUp}
            aria-label={t.blockActions.moveUp}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            disabled={disabled || index === total - 1}
            onClick={() => onMoveBlock(block.id, 1)}
            className={iconButtonClasses}
            title={t.blockActions.moveDown}
            aria-label={t.blockActions.moveDown}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDuplicateBlock(block.id)}
            className={cn(iconButtonClasses, 'hover:text-[var(--color-ink-strong)]')}
            title={t.blockActions.duplicate}
            aria-label={t.blockActions.duplicate}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDeleteBlock(block.id)}
            className={cn(iconButtonClasses, 'hover:text-red-600')}
            title={t.blockActions.delete}
            aria-label={t.blockActions.delete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {block.kind === 'versioned' ? (
        <div className="rounded-xl border border-[#d9ecdf] bg-[#f7fcf9] px-4 py-3 transition-colors">
          {(() => {
            const selectedVariant =
              block.variants.find((variant) => activeTarget?.blockId === block.id && activeTarget.localId === variant.localId) ??
              getDefaultVariant(block.variants);
            const selectedIndex = block.variants.findIndex((variant) => variant.localId === selectedVariant.localId);

            const toggleSchool = (schoolId: number) => {
              const current = selectedVariant.schoolIds;
              const next = current.includes(schoolId)
                ? current.filter((id) => id !== schoolId)
                : [...current, schoolId];
              onSetSchools(block.id, selectedVariant.localId, next);
            };

            return (
              <>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSetDefault(block.id, selectedVariant.localId)}
                    className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: selectedVariant.isDefault ? 'var(--color-brand-forest-soft)' : 'white',
                      color: 'var(--color-brand-forest)',
                      borderColor: selectedVariant.isDefault ? 'var(--color-brand-forest)' : '#cfe3d6',
                    }}
                    >
                      <Star size={11} className={selectedVariant.isDefault ? 'fill-current' : ''} />
                    {t.defaultVersion}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || block.variants.length <= 1}
                    onClick={() => {
                      const currentIndex = block.variants.findIndex((variant) => variant.localId === selectedVariant.localId);
                      const nextVariant =
                        block.variants[currentIndex + 1] ?? block.variants[currentIndex - 1] ?? getDefaultVariant(block.variants);

                      if (nextVariant && nextVariant.localId !== selectedVariant.localId) {
                        onFocusTarget({ blockId: block.id, localId: nextVariant.localId });
                      }

                      onRemoveVersion(block.id, selectedVariant.localId);
                    }}
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
                  onChange={(content) => onChangeVersion(block.id, selectedVariant.localId, content)}
                  className="py-1 text-[14px]"
                  placeholder={formatMessage(t.versionTextPlaceholder, { index: selectedIndex + 1 })}
                />

                {canAssignSchools(block) ? (
                  <SchoolChips
                    availableSchools={availableSchools}
                    selectedSchoolIds={selectedVariant.schoolIds}
                    disabled={disabled}
                    onToggle={toggleSchool}
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
              </>
            );
          })()}
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 px-1">
            <span className="mr-1 ml-1 text-[10px] text-[var(--color-ink-subtle)]">{t.versions}</span>
            {block.variants.map((variant, variantIndex) => {
              const defaultVariant = getDefaultVariant(block.variants);
              const isActive = activeTarget?.blockId === block.id
                ? activeTarget.localId === variant.localId
                : defaultVariant.localId === variant.localId;
              const isDefault = defaultVariant.localId === variant.localId;

              return (
                <button
                  key={`footer-${variant.localId}`}
                  type="button"
                  onClick={() => onFocusTarget({ blockId: block.id, localId: variant.localId })}
                  disabled={disabled}
                  className="rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: isActive
                      ? 'var(--color-brand-forest)'
                      : isDefault
                        ? 'var(--color-brand-forest-soft)'
                        : 'white',
                    color: isActive ? 'white' : 'var(--color-brand-forest)',
                    borderColor: isActive || isDefault ? 'var(--color-brand-forest)' : '#cfe3d6',
                  }}
                  title={isDefault ? t.defaultVersionTitle : formatMessage(t.versionTitle, { index: variantIndex + 1 })}
                >
                  {variantIndex + 1}
                </button>
              );
            })}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAddVersion(block.id)}
              className="inline-flex h-[22px] w-[22px] items-center justify-center rounded border border-[#cfe3d6] bg-white text-[var(--color-brand-forest)] transition-colors hover:bg-[var(--color-brand-forest-soft)] disabled:opacity-40"
              title={t.addVersion}
              aria-label={t.addVersion}
            >
              <Plus size={11} />
            </button>
          </div>
        </div>
      ) : (
        block.kind === 'paragraph' ? (
          <>
            <RichTextEditor
              handleRef={(handle) => richTextRef(targetKey(block.id, null), handle)}
              value={block.content}
              disabled={disabled}
              onFocus={() => onFocusTarget({ blockId: block.id, localId: null })}
              onRequestLink={() => onRequestLink({ blockId: block.id, localId: null })}
              onKeyDown={slashMenu.onKeyDown}
              onChange={(content) => onChangePlain(block.id, content)}
              className="text-[15px]"
              placeholder={t.paragraphPlaceholder}
            />
            {slashMenu.kinds.length > 0 ? (
              <SlashMenu
                id={slashMenuId}
                kinds={slashMenu.kinds}
                activeIndex={slashMenu.activeIndex}
                onChoose={(kind) => onChooseBlockKind(block.id, kind)}
              />
            ) : null}
            <OpinionSourcesEditor
              citations={block.sources ?? []}
              disabled={disabled}
              onChange={(sources) => onSetSources(block.id, null, sources)}
            />
          </>
        ) : (
          // A heading is one plain line of text, so it stays a textarea.
          <AutoResizingTextarea
            textareaRef={(node) => editorRef(targetKey(block.id, null), node)}
            value={block.content}
            disabled={disabled}
            onFocus={() => onFocusTarget({ blockId: block.id, localId: null })}
            onChange={(event) => onChangePlain(block.id, event.target.value.replace(/\n/g, ''))}
            maxLength={150}
            className={`border-0 bg-transparent px-0 py-0 shadow-none focus:ring-0 ${headingClasses}`}
            placeholder={block.kind === 'heading2' ? t.sectionTitlePlaceholder : t.subsectionTitlePlaceholder}
          />
        )
      )}

    </section>
  );
};
