import { Hash } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import type { EditorBlock, PlainEditorBlock } from './types';

type EditorOutlineRailProps = {
  blocks: EditorBlock[];
  /** Scrolls to the heading's block and puts the caret into it. */
  onJumpToBlock: (blockId: string) => void;
};

/**
 * The left column of the editor (E-15, #85): the draft's H2 / H3 headings as it is now, each a
 * button that jumps to its block. Shown from `lg`; the editor's layout gives it the column.
 */
export const EditorOutlineRail = ({ blocks, onJumpToBlock }: EditorOutlineRailProps) => {
  const locale = useLocale();
  const t = locale.addArticleEditor;
  const outlineItems = blocks.filter(
    (block): block is PlainEditorBlock => block.kind === 'heading2' || block.kind === 'heading3',
  );

  return (
    <nav aria-label={t.outlineLabel} className="hidden min-w-0 lg:block" data-testid="editor-outline">
      <div className="sticky top-[calc(var(--layout-header-height)+24px)] max-h-[calc(100vh-var(--layout-header-height)-48px)] overflow-y-auto pb-6 pr-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">{t.outlineTitle}</p>
        <div className="rounded-2xl border border-[var(--color-border-soft)] bg-white p-2 shadow-sm">
          {outlineItems.length > 0 ? (
            <ul className="m-0 list-none space-y-1 p-0">
              {outlineItems.map((item) => {
                const title = item.content.trim() || locale.common.untitled;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onJumpToBlock(item.id)}
                      aria-label={t.outlineJump.replace('{title}', title)}
                      title={title}
                      className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--color-page-panel)] ${item.kind === 'heading3' ? 'pl-6 text-[var(--color-ink-muted)]' : 'text-[var(--color-ink-strong)]'}`}
                    >
                      <Hash size={12} className="shrink-0 text-[var(--color-ink-subtle)]" />
                      <span className="truncate">{title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 px-2 py-2 text-[12px] text-[var(--color-ink-subtle)]">
              {t.outlineEmpty}
            </p>
          )}
        </div>
      </div>
    </nav>
  );
};
