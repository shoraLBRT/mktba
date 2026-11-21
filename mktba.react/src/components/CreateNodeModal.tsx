import React, { useEffect, useRef, useState } from 'react';
import { formatMessage } from '../localization';
import { useLocale } from '../localization/hooks';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';

interface CreateNodeModalProps {
  parentTitle?: string;
  /** Set to rename an existing article: the field starts with its title and the dialog says «Переименование». */
  currentTitle?: string;
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: (title: string) => void;
  onClose: () => void;
}

/** The title dialog of the admin tree: a new section (under `parentTitle` or at the top) or a new name for an article. */
const CreateNodeModal: React.FC<CreateNodeModalProps> = ({
  parentTitle,
  currentTitle,
  isPending,
  errorMessage,
  onConfirm,
  onClose,
}) => {
  const locale = useLocale();
  const t = locale.createNode;
  const renaming = currentTitle !== undefined;
  const [title, setTitle] = useState(currentTitle ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => inputRef.current?.select(), 50);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle !== '' && trimmedTitle !== currentTitle && !isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canSubmit) {
      onConfirm(trimmedTitle);
    }
  };

  const heading = renaming ? locale.renameNode.title : t.newSection;
  const subtitle = renaming
    ? locale.renameNode.hint
    : parentTitle
      ? formatMessage(t.childOf, { title: parentTitle })
      : t.rootSection;
  const submitLabel = renaming
    ? isPending ? locale.renameNode.submitting : locale.renameNode.submit
    : isPending ? t.submitting : t.submit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="create-node-heading">
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <p id="create-node-heading" className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-ink-strong)]">
            {heading}
          </p>
          <p className="mb-0 mt-0.5 text-[12px] text-[var(--color-ink-muted)]">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4">
            <Input
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t.titlePlaceholder}
              aria-label={t.titlePlaceholder}
              autoComplete="off"
              disabled={isPending}
            />

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
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default CreateNodeModal;
