import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import type { PrepublishWarning } from './prepublishChecks';

type PrepublishChecklistProps = {
  warnings: PrepublishWarning[];
  /** Brings the block (and the opinion, when the warning names one) into view and focuses it. */
  onJump: (blockId: string, localId?: string) => void;
};

/** The publication panel's list of what to look at before review or publication (E-14, #84). */
export const PrepublishChecklist = ({ warnings, onJump }: PrepublishChecklistProps) => {
  const t = useLocale().addArticlePage.publication.checks;

  return (
    <div data-testid="prepublish-checklist">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">{t.title}</h3>
      {warnings.length === 0 ? (
        <p className="m-0 flex items-center gap-1.5 text-[11px] text-emerald-700">
          <CheckCircle2 size={12} aria-hidden="true" />
          {t.none}
        </p>
      ) : (
        <ul className="m-0 space-y-1 pl-0">
          {warnings.map((warning) => (
            <li key={JSON.stringify(warning)}className="flex list-none items-start justify-between gap-2 text-[11px] text-amber-800">
              <span className="flex min-w-0 items-start gap-1.5 break-words">
                <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                {formatMessage(t[warning.code], {
                  block: 'blockNumber' in warning ? warning.blockNumber : '',
                  count: 'count' in warning ? warning.count : '',
                  length: 'length' in warning ? warning.length : '',
                  maxLength: 'maxLength' in warning ? warning.maxLength : '',
                })}
              </span>
              {'blockId' in warning ? (
                <button
                  type="button"
                  onClick={() => onJump(warning.blockId, 'localId' in warning ? warning.localId : undefined)}
                  className="shrink-0 rounded px-1 text-[11px] font-medium underline hover:bg-amber-50"
                >
                  {t.jump}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
