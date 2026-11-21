import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { Textarea } from '../../shared/ui/Textarea';

export type EditorNoticeTone = 'success' | 'warning' | 'error';

export type EditorNoticeValue = {
  tone: EditorNoticeTone;
  message: string;
};

const noticeClasses: Record<EditorNoticeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
};

/** The editor's message above the document: a save's outcome or why it was refused. */
export const EditorNotice = ({ notice, onDismiss }: { notice: EditorNoticeValue; onDismiss: () => void }) => (
  <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm shadow-sm ${noticeClasses[notice.tone]}`}>
    <div className="flex items-start justify-between gap-3">
      <p className="m-0">{notice.message}</p>
      <button type="button" onClick={onDismiss} className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  </div>
);

type ImportMarkdownDialogProps = {
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
  onClose: () => void;
};

/** Markdown pasted here is split into the editor's blocks. */
export const ImportMarkdownDialog = ({ value, onChange, onImport, onClose }: ImportMarkdownDialogProps) => {
  const locale = useLocale();
  const t = locale.addArticlePage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-[var(--color-border-soft)] bg-white shadow-[0_30px_80px_rgba(28,27,24,0.18)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-5">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-subtle)]">{t.importModalEyebrow}</p>
            <h2 className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.importModalTitle}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="m-0 text-sm leading-6 text-[var(--color-ink-muted)]">
            {t.importModalDescription}
          </p>
          <Textarea
            rows={10}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t.importPlaceholder}
            className="min-h-[240px] rounded-2xl font-mono text-[13px] leading-6"
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
          <Button variant="ghost" onClick={onClose}>{locale.common.cancel}</Button>
          <Button variant="primary" onClick={onImport}>{t.importing}</Button>
        </div>
      </div>
    </div>
  );
};

/** Covers the editor while the AI restyles the article, so nothing is edited under it. */
export const AiRunningOverlay = () => {
  const t = useLocale().addArticlePage;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.18)] backdrop-blur-[2px]">
      <Card className="border border-[var(--color-border-soft)] bg-white px-6 py-5 shadow-[0_24px_80px_rgba(28,27,24,0.14)]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-soft)] border-t-[var(--color-brand-forest)]" />
          <div>
            <p className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">{t.aiOverlayTitle}</p>
            <p className="mb-0 mt-1 text-sm text-[var(--color-ink-muted)]">{t.aiOverlayDescription}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

/** Asks before a navigation drops the editor's unsaved edits; staying is the default. */
export const UnsavedChangesDialog = ({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) => {
  const t = useLocale().addArticlePage.unsavedChanges;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlayRef.current?.querySelector<HTMLButtonElement>('[data-stay]')?.focus();
    const stayOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onStay();
      }
    };
    window.addEventListener('keydown', stayOnEscape);
    return () => window.removeEventListener('keydown', stayOnEscape);
  }, [onStay]);

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
        className="w-full max-w-xl"
      >
        <div className="border-b border-[var(--color-border-soft)] px-6 py-5">
          <h2 id="unsaved-changes-title" className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
        </div>
        <div className="px-6 py-5">
          <p id="unsaved-changes-description" className="m-0 text-sm leading-7 text-[var(--color-ink-muted)]">{t.description}</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
          <Button variant="ghost" onClick={onLeave}>{t.leave}</Button>
          <Button data-stay variant="primary" onClick={onStay}>{t.stay}</Button>
        </div>
      </Card>
    </div>
  );
};

/**
 * Asks before a block of opinions becomes a plain paragraph and loses the other opinions' text;
 * cancelling is the default.
 */
export const ConvertToParagraphDialog = ({
  lostOpinions,
  onCancel,
  onConfirm,
}: {
  lostOpinions: number;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const t = useLocale().addArticlePage.convertToParagraph;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlayRef.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [onCancel]);

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="convert-to-paragraph-title"
        aria-describedby="convert-to-paragraph-description"
        className="w-full max-w-xl"
      >
        <div className="border-b border-[var(--color-border-soft)] px-6 py-5">
          <h2 id="convert-to-paragraph-title" className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
        </div>
        <div className="px-6 py-5">
          <p id="convert-to-paragraph-description" className="m-0 text-sm leading-7 text-[var(--color-ink-muted)]">
            {formatMessage(t.description, { count: lostOpinions })}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
          <Button variant="ghost" onClick={onConfirm}>{t.confirm}</Button>
          <Button data-cancel variant="primary" onClick={onCancel}>{t.cancel}</Button>
        </div>
      </Card>
    </div>
  );
};

/**
 * Asked before a move to review or publication while the checklist has warnings (E-14, #84).
 * «Исправить» is focused and Escape picks it, so going on needs a deliberate click.
 */
export const PrepublishWarningsDialog = ({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const t = useLocale().addArticlePage.publication.checks;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlayRef.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [onCancel]);

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="prepublish-warnings-title"
        aria-describedby="prepublish-warnings-description"
        className="w-full max-w-md"
      >
        <div className="border-b border-[var(--color-border-soft)] px-6 py-5">
          <h2 id="prepublish-warnings-title" className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.confirmTitle}</h2>
        </div>
        <div className="px-6 py-5">
          <p id="prepublish-warnings-description" className="m-0 text-sm leading-7 text-[var(--color-ink-muted)]">
            {formatMessage(t.confirmDescription, { count })}
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
          <Button variant="ghost" onClick={onConfirm}>{t.confirm}</Button>
          <Button data-cancel variant="primary" onClick={onCancel}>{t.cancel}</Button>
        </div>
      </Card>
    </div>
  );
};

type DeleteArticleDialogProps = {
  title: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Deleting an article asks for its title to be typed first. */
export const DeleteArticleDialog = ({ title, isDeleting, onConfirm, onClose }: DeleteArticleDialogProps) => {
  const locale = useLocale();
  const t = locale.editArticlePage;
  const [confirmation, setConfirmation] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl">
        <div className="border-b border-[var(--color-border-soft)] px-6 py-5">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-500">{t.deleteModalEyebrow}</p>
          <h2 className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.deleteModalTitle}</h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="m-0 text-sm leading-7 text-[var(--color-ink-muted)]">
            {t.deleteModalDescription.replace('{title}', title)}
          </p>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={title}
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            {locale.common.cancel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={confirmation !== title || isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? '...' : t.deleteModalConfirm}
          </Button>
        </div>
      </Card>
    </div>
  );
};
