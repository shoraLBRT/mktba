import { Eye, EyeOff, Import, Save, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../localization/hooks';
import { Button } from '../../shared/ui/Button';
import { AI_SETTINGS_PATH, type AiAvailability } from './aiAvailability';

type EditorToolbarProps = {
  disabled: boolean;
  isPreview: boolean;
  aiAvailability: AiAvailability;
  isAiRunning: boolean;
  isSaving: boolean;
  onTogglePreview: () => void;
  onImport: () => void;
  onImproveAll: () => void;
  onSave: () => void;
  showDelete?: boolean;
  isDeleting?: boolean;
  onDelete?: () => void;
};

export const EditorToolbar = ({
  disabled,
  isPreview,
  aiAvailability,
  isAiRunning,
  isSaving,
  onTogglePreview,
  onImport,
  onImproveAll,
  onSave,
  showDelete,
  isDeleting,
  onDelete,
}: EditorToolbarProps) => {
  const locale = useLocale();
  const t = locale.addArticleEditor.topToolbar;
  const editT = locale.editArticlePage;
  const aiHint =
    aiAvailability === 'notConfigured' ? t.aiNotConfiguredHint : aiAvailability === 'disabled' ? t.aiDisabledHint : null;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <Button className="min-h-8 rounded-lg px-2 py-1 text-[11px] whitespace-nowrap" onClick={onTogglePreview} disabled={disabled && !isPreview} title={isPreview ? t.previewOff : t.previewOn}>
          {isPreview ? <EyeOff size={13} /> : <Eye size={13} />}
          {isPreview ? t.editLabel : t.previewLabel}
        </Button>
        <Button className="min-h-8 rounded-lg px-2.5 py-1 text-[11px] whitespace-nowrap" variant="primary" onClick={onSave} disabled={disabled || isSaving} title={t.saveTitle}>
          <Save size={13} />
          {isSaving ? '...' : t.save}
        </Button>
        <Button className="min-h-8 rounded-lg px-2 py-1 text-[11px] whitespace-nowrap" onClick={onImport} disabled={disabled} title={t.importTitle}>
          <Import size={13} />
          {t.import}
        </Button>
        <Button className="min-h-8 rounded-lg px-2 py-1 text-[11px] whitespace-nowrap" onClick={onImproveAll} disabled={disabled || aiAvailability !== 'ready'} title={aiHint ?? t.improveWithAiTitle}>
          <Sparkles size={13} />
          {isAiRunning ? '...' : t.improveWithAi}
        </Button>
      </div>
      {aiHint ? (
        <p className="text-[11px] leading-snug text-[var(--color-ink-subtle)]">
          {aiHint}{' '}
          <Link to={AI_SETTINGS_PATH} className="underline hover:text-[var(--color-ink)]">
            {t.aiSettingsLink}
          </Link>
        </p>
      ) : null}
      {showDelete ? (
        <Button
          className="min-h-8 w-full rounded-lg px-2 py-1 text-[11px] whitespace-nowrap"
          variant="danger"
          onClick={onDelete}
          disabled={disabled || isDeleting}
        >
          <Trash2 size={13} />
          {isDeleting ? '...' : editT.deleteButton}
        </Button>
      ) : null}
    </div>
  );
};
