import { useLocale } from '../../localization/hooks';
import { RemarkList } from '../../components/remarks/RemarkThread';
import type { ArticleRemarkDto } from '../../shared/types/ApiTypes';

type EditorRemarksPanelProps = {
  remarks: readonly ArticleRemarkDto[];
  /** Scrolls the editor to the block with this paragraph id. */
  onJump: (paragraphId: number) => void;
};

/**
 * «Замечания учёных» in the editor's right rail (V-06, #122): the scholars' remarks on the blocks
 * of a saved article, open first, each with its thread and the author's reply, close and «К блоку».
 * Shown only when the article has remarks; the blocks with open ones are marked in the text.
 */
export const EditorRemarksPanel = ({ remarks, onJump }: EditorRemarksPanelProps) => {
  const t = useLocale().articleRemarks;
  if (remarks.length === 0) return null;

  return (
    <section aria-labelledby="editor-remarks-title" data-testid="editor-remarks-panel">
      <h2 id="editor-remarks-title" className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
        {t.editorTitle}
      </h2>
      <div className="space-y-3 rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 text-sm shadow-sm">
        <p className="m-0 text-xs text-[var(--color-ink-muted)]">{t.editorHint}</p>
        <RemarkList remarks={remarks} onJump={onJump} />
      </div>
    </section>
  );
};
