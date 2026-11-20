import { GitBranch, Heading2, Heading3, Pilcrow } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import { cn } from '../../shared/lib/cn';
import type { SlashMenuKind } from './slashMenuKinds';

const icons: Record<SlashMenuKind, typeof Pilcrow> = {
  paragraph: Pilcrow,
  heading2: Heading2,
  heading3: Heading3,
  versioned: GitBranch,
};

type SlashMenuProps = {
  id: string;
  kinds: SlashMenuKind[];
  activeIndex: number;
  onChoose: (kind: SlashMenuKind) => void;
};

/**
 * The `/` menu under an empty paragraph: the kinds of block it can become. The focus stays in the
 * text, which takes the arrows, Enter and Escape (`DocumentBlockEditor`), so the list only shows
 * the choice and takes clicks.
 */
export const SlashMenu = ({ id, kinds, activeIndex, onChoose }: SlashMenuProps) => {
  const t = useLocale().addArticleEditor.slashMenu;

  return (
    <div className="mt-1 w-full max-w-[320px] rounded-xl border border-[var(--color-border-soft)] bg-white p-1 shadow-[0_18px_48px_rgba(28,27,24,0.12)]">
      <ul id={id} role="listbox" aria-label={t.label} className="m-0 list-none p-0">
        {kinds.map((kind, index) => {
          const Icon = icons[kind];
          const isActive = index === activeIndex;
          return (
            <li
              key={kind}
              id={`${id}-${kind}`}
              role="option"
              aria-selected={isActive}
              // Keeps the focus in the text while the option is clicked.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(kind)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5',
                isActive ? 'bg-[var(--color-brand-forest-soft)]' : 'hover:bg-[var(--color-page-panel)]',
              )}
            >
              <Icon size={14} className="shrink-0 text-[var(--color-brand-forest)]" />
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold text-[var(--color-ink-strong)]">{t.kinds[kind]}</span>
                <span className="text-[11px] text-[var(--color-ink-subtle)]">{t.descriptions[kind]}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 px-2 pb-1 pt-1.5 text-[10px] text-[var(--color-ink-subtle)]">{t.hint}</p>
    </div>
  );
};
