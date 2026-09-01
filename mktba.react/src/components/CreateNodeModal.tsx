import React, { useEffect, useId, useRef, useState } from 'react';
import { formatMessage } from '../localization';
import { useLocale } from '../localization/hooks';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';

interface CreateNodeModalProps {
  parentTitle?: string;
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: (title: string) => void;
  onClose: () => void;
}

const CreateNodeModal: React.FC<CreateNodeModalProps> = ({
  parentTitle,
  isPending,
  errorMessage,
  onConfirm,
  onClose,
}) => {
  const locale = useLocale();
  const t = locale.createNode;
  const formId = useId();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 50);
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (trimmedTitle && !isPending) {
      onConfirm(trimmedTitle);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm">
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <p className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-ink-strong)]">
            {t.newSection}
          </p>
          <p className="mb-0 mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
            {parentTitle ? formatMessage(t.childOf, { title: parentTitle }) : t.rootSection}
          </p>
        </div>

        <form id={formId} onSubmit={handleSubmit} className="px-5 py-4">
          <Input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.titlePlaceholder}
            autoComplete="off"
            disabled={isPending}
          />

          {errorMessage ? (
            <p role="alert" className="mb-0 mt-2 text-[12px] leading-5 text-red-600">
              {errorMessage}
            </p>
          ) : null}
        </form>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-soft)] px-5 py-3">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {locale.common.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!title.trim() || isPending}
          >
            {isPending ? t.submitting : t.submit}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CreateNodeModal;
