import { useEffect } from 'react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import type { ArticleStatus } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

type BulkStatusConfirmModalProps = {
  status: ArticleStatus;
  count: number;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Asks before moving the selected articles to one status; Escape or «Отмена» closes it. */
export const BulkStatusConfirmModal = ({ status, count, isPending, onConfirm, onClose }: BulkStatusConfirmModalProps) => {
  const locale = useLocale();
  const t = locale.adminArticleList;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="bulk-status-title">
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <p id="bulk-status-title" className="m-0 text-[15px] font-semibold text-[var(--color-ink-strong)]">
            {t.bulkConfirmTitle}
          </p>
        </div>
        <p className="m-0 px-5 py-4 text-sm text-[var(--color-ink-default)]">
          {formatMessage(t.bulkConfirm, { count, status: locale.articleStatus[status] })}
        </p>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-soft)] px-5 py-3">
          <Button onClick={onClose} disabled={isPending}>
            {t.bulkCancel}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isPending}>
            {t.bulkApply}
          </Button>
        </div>
      </Card>
    </div>
  );
};
