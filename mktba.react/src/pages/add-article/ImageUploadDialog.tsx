import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { uploadArticleImage } from '../../services/uploadService';
import type { UploadedImageDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { findUploadFileProblem, UPLOAD_MAX_BYTES } from '../../shared/upload';
import { altFromFileName, imageMarkdown } from './imageMarkdown';

type ImageUploadDialogProps = {
  /** The file picked with «Картинка», pasted or dropped into the text. */
  file: File;
  /** The image's Markdown, `![alt](url)`, to insert where the selection of the text was. */
  onInsert: (markdown: string) => void;
  onClose: () => void;
};

type UploadState =
  | { kind: 'uploading'; share: number }
  | { kind: 'done'; image: UploadedImageDto }
  | { kind: 'failed'; message: string };

/**
 * An image for the article's text (U-08, #73): the upload starts at once, while the author writes
 * the description; «Вставить» puts `![description](url)` into the text once the server has the
 * image. Closing the dialog cancels an upload still under way.
 */
export const ImageUploadDialog = ({ file, onInsert, onClose }: ImageUploadDialogProps) => {
  const locale = useLocale();
  const t = locale.addArticleEditor.richText.imageDialog;
  const titleId = useId();
  const hintId = useId();
  const [alt, setAlt] = useState(() => altFromFileName(file.name));
  // A file the server would refuse anyway is not sent; the dialog is mounted for one file.
  const [problem] = useState(() => findUploadFileProblem(file));
  const [upload, setUpload] = useState<UploadState>(() =>
    problem
      ? {
          kind: 'failed',
          message:
            problem === 'tooLarge'
              ? formatMessage(locale.apiErrors.upload_too_large, { maxMegabytes: UPLOAD_MAX_BYTES / (1024 * 1024) })
              : locale.apiErrors.upload_type_unsupported,
        }
      : { kind: 'uploading', share: 0 },
  );

  useEffect(() => {
    if (problem) {
      return;
    }
    const controller = new AbortController();
    uploadArticleImage(file, (share) => setUpload({ kind: 'uploading', share }), controller.signal).then(
      (image) => setUpload({ kind: 'done', image }),
      (error: unknown) => {
        if (!controller.signal.aborted) setUpload({ kind: 'failed', message: (error as Error).message });
      },
    );
    return () => controller.abort();
  }, [file, problem]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (upload.kind === 'done') onInsert(imageMarkdown(alt, upload.image.url));
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-5">
            <h2 id={titleId} className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="rounded-lg p-2 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)]"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3 px-6 py-5">
            {upload.kind === 'failed' ? (
              <p role="alert" className="m-0 text-sm text-red-700">{upload.message}</p>
            ) : (
              <p role="status" className="m-0 text-sm text-[var(--color-ink-muted)]">
                {upload.kind === 'uploading'
                  ? formatMessage(t.uploading, { percent: Math.round(upload.share * 100) })
                  : formatMessage(t.uploaded, { width: upload.image.width, height: upload.image.height })}
              </p>
            )}
            <Input
              autoFocus
              type="text"
              value={alt}
              aria-label={t.altLabel}
              aria-describedby={hintId}
              onChange={(event) => setAlt(event.target.value)}
            />
            <p id={hintId} className="m-0 text-xs text-[var(--color-ink-subtle)]">{t.altHint}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--color-border-soft)] px-6 py-4">
            <Button type="button" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" variant="primary" disabled={upload.kind !== 'done'}>{t.insert}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
