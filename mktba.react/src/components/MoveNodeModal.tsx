import React, { useEffect, useState } from 'react';
import { useLocale } from '../localization/hooks';
import type { ParentOption } from '../shared/articleTree';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';

interface MoveNodeModalProps {
  articleTitle: string;
  /** The article's current parent; null for the top level. */
  currentParentId: number | null;
  /** Articles that may become the parent: the article itself and its descendants are already left out. */
  parentOptions: ParentOption[];
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: (parentId: number | null) => void;
  onClose: () => void;
}

const ROOT_VALUE = '';

/** Picks a new parent for an article; the move places it last among the new siblings. */
const MoveNodeModal: React.FC<MoveNodeModalProps> = ({
  articleTitle,
  currentParentId,
  parentOptions,
  isPending,
  errorMessage,
  onConfirm,
  onClose,
}) => {
  const locale = useLocale();
  const t = locale.moveNode;
  const [parentValue, setParentValue] = useState(currentParentId === null ? ROOT_VALUE : String(currentParentId));
  const selectedParentId = parentValue === ROOT_VALUE ? null : Number(parentValue);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isPending && selectedParentId !== currentParentId) {
      onConfirm(selectedParentId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm">
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <p className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-ink-strong)]">{t.title}</p>
          <p className="mb-0 mt-0.5 truncate text-[12px] text-[var(--color-ink-muted)]">{articleTitle}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4">
            <label htmlFor="move-node-parent" className="mb-1 block text-[12px] font-medium text-[var(--color-ink-default)]">
              {t.parentLabel}
            </label>
            <select
              id="move-node-parent"
              value={parentValue}
              onChange={(event) => setParentValue(event.target.value)}
              disabled={isPending}
              className="h-9 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
            >
              <option value={ROOT_VALUE}>{t.root}</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${'  '.repeat(option.depth + 1)}${option.title}`}
                </option>
              ))}
            </select>
            <p className="mb-0 mt-2 text-[12px] leading-5 text-[var(--color-ink-muted)]">{t.hint}</p>

            {errorMessage ? (
              <p role="alert" className="mb-0 mt-2 text-[12px] leading-5 text-red-600">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--color-border-soft)] px-5 py-3">
            <Button variant="secondary" onClick={onClose} disabled={isPending}>
              {locale.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={isPending || selectedParentId === currentParentId}>
              {isPending ? t.submitting : t.submit}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default MoveNodeModal;
