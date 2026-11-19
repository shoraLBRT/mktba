import { X } from 'lucide-react';
import type { Notice } from './useNotice';

const noticeClasses: Record<Notice['tone'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
};

type NoticeBannerProps = {
  notice: Notice | null;
  onClose: () => void;
};

/** Shows the page's current notice, if any, with a close button. */
export const NoticeBanner = ({ notice, onClose }: NoticeBannerProps) =>
  notice ? (
    <div className={`rounded-xl border px-4 py-3 text-sm ${noticeClasses[notice.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="m-0">{notice.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  ) : null;
