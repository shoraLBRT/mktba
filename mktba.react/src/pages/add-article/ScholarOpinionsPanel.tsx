import { useId, useState } from 'react';
import { GraduationCap, PenLine, Plus, Trash2 } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { scholarOpinionFormOf, type ScholarOpinionForm } from './useArticleSchools';

type ArticleOption = { id: number; title: string; path: string };

type ScholarOpinionsPanelProps = {
  /** The article's scholar opinions: created for it, used by it or picked from the directory. */
  schools: SchoolDto[];
  /** Directory entries the article does not have yet. */
  directory: SchoolDto[];
  /** Articles to choose the one about the scholar from. */
  articleOptions: ArticleOption[];
  isLocked: boolean;
  canManage: (school: SchoolDto) => boolean;
  onPick: (id: number) => void;
  onAdd: (form: ScholarOpinionForm) => void;
  onUpdate: (id: number, form: ScholarOpinionForm) => void;
  onDelete: (id: number) => void;
};

const fieldClass = 'h-7 rounded-lg text-[12px]';

/**
 * The editor's «Мнения учёных» block (M-08, #116): the article's scholar opinions with their scholar
 * and years, a pick from the shared directory, and a form to create or change one — name, short name
 * for the tab, the scholar, years of life, a note and the article about the scholar.
 */
export const ScholarOpinionsPanel = ({
  schools,
  directory,
  articleOptions,
  isLocked,
  canManage,
  onPick,
  onAdd,
  onUpdate,
  onDelete,
}: ScholarOpinionsPanelProps) => {
  const t = useLocale().addArticleEditor.customSchools;
  const tc = useLocale().common;
  const idPrefix = useId();
  /** null: no form; 0: a new entry; otherwise the id of the entry being changed. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ScholarOpinionForm>(() => scholarOpinionFormOf(null));

  const openForm = (school: SchoolDto | null) => {
    setForm(scholarOpinionFormOf(school));
    setEditingId(school?.id ?? 0);
  };
  const closeForm = () => setEditingId(null);
  const set = <K extends keyof ScholarOpinionForm>(key: K, value: ScholarOpinionForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const canSubmit = !isLocked && form.name.trim() !== '' && form.shortName.trim() !== '';
  const submit = () => {
    if (!canSubmit) return;
    const values = { ...form, name: form.name.trim(), shortName: form.shortName.trim() };
    if (editingId === 0) onAdd(values);
    else if (editingId !== null) onUpdate(editingId, values);
    closeForm();
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border-soft)] bg-white shadow-sm" data-testid="scholar-opinions">
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-3">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
          <GraduationCap size={11} />
          {t.title}
        </p>
        {editingId === null && (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => openForm(null)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--color-brand-forest)] transition-colors hover:bg-[var(--color-brand-forest-soft)] disabled:opacity-40"
          >
            <Plus size={10} />
            {t.addButton}
          </button>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        {schools.length === 0 && editingId === null && (
          <p className="text-[11px] text-[var(--color-ink-subtle)]">{t.emptyState}</p>
        )}

        {schools.map((school) => (
          <div key={school.id} className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-[#cfe3d6] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand-forest)]"
              title={school.name}
            >
              {school.shortName}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-[var(--color-ink-strong)]">{school.name}</span>
              {school.scholarName ? (
                <span className="block truncate text-[10px] text-[var(--color-ink-subtle)]">
                  {school.scholarYears ? `${school.scholarName}, ${school.scholarYears}` : school.scholarName}
                </span>
              ) : null}
            </span>
            {canManage(school) ? (
              <>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => openForm(school)}
                  className="shrink-0 rounded p-1 text-[var(--color-ink-subtle)] transition-colors hover:bg-[var(--color-brand-forest-soft)] disabled:opacity-40"
                  title={t.editTitle}
                  aria-label={`${t.editTitle}: ${school.name}`}
                >
                  <PenLine size={11} />
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onDelete(school.id)}
                  className="shrink-0 rounded p-1 text-[var(--color-ink-subtle)] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  title={t.deleteTitle}
                  aria-label={`${t.deleteTitle}: ${school.name}`}
                >
                  <Trash2 size={11} />
                </button>
              </>
            ) : null}
          </div>
        ))}

        {directory.length > 0 && editingId === null ? (
          <select
            aria-label={t.pickFromDirectory}
            disabled={isLocked}
            value=""
            onChange={(event) => {
              const id = Number(event.target.value);
              if (id > 0) onPick(id);
            }}
            className="h-7 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-[12px] text-[var(--color-ink-strong)]"
          >
            <option value="">{t.pickFromDirectory}</option>
            {directory.map((school) => (
              <option key={school.id} value={school.id}>
                {school.scholarName && school.scholarName !== school.name ? `${school.name} (${school.scholarName})` : school.name}
              </option>
            ))}
          </select>
        ) : null}

        {editingId !== null && (
          <div className="space-y-1.5 pt-1" role="group" aria-label={editingId === 0 ? t.newTitle : t.editTitle}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t.namePlaceholder} aria-label={t.namePlaceholder} disabled={isLocked} className={fieldClass} autoFocus />
            <Input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} placeholder={t.shortNamePlaceholder} aria-label={t.shortNamePlaceholder} disabled={isLocked} className={fieldClass} maxLength={20} />
            <Input value={form.scholarName} onChange={(e) => set('scholarName', e.target.value)} placeholder={t.scholarNamePlaceholder} aria-label={t.scholarNamePlaceholder} disabled={isLocked} className={fieldClass} />
            <Input value={form.scholarYears} onChange={(e) => set('scholarYears', e.target.value)} placeholder={t.scholarYearsPlaceholder} aria-label={t.scholarYearsPlaceholder} disabled={isLocked} className={fieldClass} />
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t.descriptionPlaceholder}
              aria-label={t.descriptionPlaceholder}
              disabled={isLocked}
              rows={3}
              maxLength={2000}
              className="w-full resize-y rounded-lg border border-[var(--color-border-soft)] px-3 py-1.5 text-[12px] text-[var(--color-ink-strong)] outline-none focus:border-[var(--color-brand-forest)]"
            />
            <label className="block text-[10px] text-[var(--color-ink-subtle)]" htmlFor={`${idPrefix}-article`}>
              {t.scholarArticleLabel}
            </label>
            <select
              id={`${idPrefix}-article`}
              disabled={isLocked}
              value={form.scholarArticleId ?? ''}
              onChange={(e) => set('scholarArticleId', e.target.value === '' ? null : Number(e.target.value))}
              className="h-7 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-[12px] text-[var(--color-ink-strong)]"
            >
              <option value="">{t.scholarArticleNone}</option>
              {articleOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.path || option.title}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <Button variant="primary" onClick={submit} disabled={!canSubmit} className="h-6 flex-1 rounded-lg px-2 text-[11px]">
                {editingId === 0 ? t.addButton : t.saveButton}
              </Button>
              <Button variant="ghost" onClick={closeForm} className="h-6 rounded-lg px-2 text-[11px]">
                {tc.cancel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
