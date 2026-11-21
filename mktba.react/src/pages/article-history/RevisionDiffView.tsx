import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import type { DiffLine, SectionDiff } from './revisionDiff';

const lineClasses: Record<DiffLine['kind'], string> = {
  same: 'text-[var(--color-ink-muted)]',
  added: 'bg-emerald-50 text-emerald-900',
  removed: 'bg-red-50 text-red-800 line-through decoration-red-300',
};

const linePrefix: Record<DiffLine['kind'], string> = { same: ' ', added: '+', removed: '−' };

/** The changed sections line by line, then the names of those without changes. */
export const RevisionDiffSections = ({ sections }: { sections: SectionDiff[] }) => {
  const t = useLocale().articleHistoryPage;
  const changed = sections.filter((section) => section.changed);
  const unchanged = sections.filter((section) => !section.changed);

  return (
    <>
      {changed.length === 0 ? <p className="m-0 text-sm">{t.noChanges}</p> : null}
      {changed.map((section) => (
        <section key={section.key} aria-label={section.label}>
          <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink-default)]">{section.label}</h3>
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--color-border-soft)] p-3 text-sm leading-6">
            {section.lines.map((line, index) => (
              <div key={index} className={lineClasses[line.kind]} data-diff={line.kind}>
                {`${linePrefix[line.kind]} ${line.text}`}
              </div>
            ))}
          </pre>
        </section>
      ))}
      {unchanged.length > 0 ? (
        <p className="m-0 text-xs text-[var(--color-ink-subtle)]">
          {formatMessage(t.unchangedSections, { sections: unchanged.map((section) => section.label).join(', ') })}
        </p>
      ) : null}
    </>
  );
};
