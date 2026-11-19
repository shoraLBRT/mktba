import React, { useMemo, useState } from 'react';
import { Bot, Check, HelpCircle, Sparkles, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkAiConnection,
  getAiProviderSettings,
  resetAiSettings,
  updateAiProviderSettings,
} from '../../services/adminService';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { Switch } from '../../shared/ui/Switch';
import { Textarea } from '../../shared/ui/Textarea';

type AiSettingsState = {
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  apiKey: string;
  markdownStylingSystemPrompt: string;
};

/** `/admin/ai`: the AI provider connection and the markdown styling prompt. */
const AdminAiSettingsPage: React.FC = () => {
  const locale = useLocale();
  const t = locale.adminPage;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const [aiCheckResult, setAiCheckResult] = useState<{ message: string; styledText: string } | null>(null);
  const [aiSettingsFormOverride, setAiSettingsFormOverride] = useState<AiSettingsState | null>(null);
  const [isDefaultPromptModalOpen, setIsDefaultPromptModalOpen] = useState(false);

  const aiSettingsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_AI_SETTINGS],
    queryFn: getAiProviderSettings,
  });

  const aiSettingsDefaults = useMemo<AiSettingsState>(
    () => ({
      baseUrl: aiSettingsQuery.data?.baseUrl ?? '',
      model: aiSettingsQuery.data?.model ?? '',
      isEnabled: aiSettingsQuery.data?.isEnabled ?? false,
      apiKey: '',
      markdownStylingSystemPrompt: aiSettingsQuery.data?.markdownStylingSystemPrompt ?? '',
    }),
    [aiSettingsQuery.data],
  );

  const aiSettingsForm = aiSettingsFormOverride ?? aiSettingsDefaults;

  const updateAiSettingsForm = (updater: (current: AiSettingsState) => AiSettingsState) => {
    setAiSettingsFormOverride((current) => updater(current ?? aiSettingsDefaults));
  };

  const aiSettingsMutation = useMutation({
    mutationFn: updateAiProviderSettings,
    onSuccess: async () => {
      showNotice('success', t.aiSettingsUpdated);
      setAiSettingsFormOverride(null);
      await queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_AI_SETTINGS] });
    },
    onError: (error) => showNotice('error', `${t.aiSettingsUpdateFailed}: ${(error as Error).message}`),
  });

  const aiConnectionCheckMutation = useMutation({
    mutationFn: checkAiConnection,
    onSuccess: (result) => {
      setAiCheckResult(result);
      showNotice('success', result.message);
    },
    onError: (error) => showNotice('error', `${t.aiCheckFailed}: ${(error as Error).message}`),
  });

  const resetAiSettingsMutation = useMutation({
    mutationFn: resetAiSettings,
    onSuccess: (data) => {
      queryClient.setQueryData([APP_CONSTANTS.QUERY_KEYS.ADMIN_AI_SETTINGS], data);
      setAiSettingsFormOverride(null);
      showNotice('success', t.resetAiSettingsSuccess);
    },
    onError: (error) => showNotice('error', `${t.resetAiSettingsFailed}: ${(error as Error).message}`),
  });

  const saveAiSettings = () => {
    if (!aiSettingsForm.baseUrl.trim()) {
      showNotice('warning', t.baseUrlRequired);
      return;
    }

    if (!aiSettingsForm.model.trim()) {
      showNotice('warning', t.modelRequired);
      return;
    }

    aiSettingsMutation.mutate({
      baseUrl: aiSettingsForm.baseUrl.trim(),
      model: aiSettingsForm.model.trim(),
      isEnabled: aiSettingsForm.isEnabled,
      apiKey: aiSettingsForm.apiKey.trim() || undefined,
      markdownStylingSystemPrompt: aiSettingsForm.markdownStylingSystemPrompt.trim() || null,
    });
  };

  const aiStatusHint = aiSettingsQuery.isLoading
    ? t.aiConfigurationDescription
    : !aiSettingsQuery.data?.isConfigured
      ? t.aiStatusNotConfigured
      : aiSettingsQuery.data.isEnabled
        ? t.aiStatusReady
        : t.aiStatusOff;
  const capabilities = [t.aiCapability1, t.aiCapability2, t.aiCapability3, t.aiCapability4];

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.aiTab}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Configure your AI provider connection and customize the markdown styling behavior.</p>
      </div>

      <Card className="border-[var(--color-brand-forest-soft)] bg-[var(--color-brand-forest-soft)]/20 p-6">
        <div className="flex gap-4">
          <Bot size={24} className="flex-shrink-0 text-[var(--color-brand-forest)]" />
          <div>
            <h3 className="font-semibold text-[var(--color-ink-strong)]">{t.aiCapabilitiesTitle}</h3>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.aiCapabilitiesDescription}</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--color-ink-muted)]">
              {capabilities.map((capability) => (
                <li key={capability} className="flex items-start gap-2">
                  <span className="text-[var(--color-brand-forest)] font-bold">•</span>
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-6 rounded-lg bg-[var(--color-surface-muted)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">Status</p>
          <p className="mt-1 text-base font-semibold text-[var(--color-ink-strong)]">{aiStatusHint}</p>
        </div>

        <form autoComplete="off" className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch
              checked={aiSettingsForm.isEnabled}
              onChange={(checked) => updateAiSettingsForm((current) => ({ ...current, isEnabled: checked }))}
            />
            <span className="text-sm font-medium text-[var(--color-ink-strong)]">{t.aiEnabled}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                {t.baseUrl}
              </label>
              <Input
                name="ai-base-url"
                autoComplete="url"
                value={aiSettingsForm.baseUrl}
                onChange={(event) => updateAiSettingsForm((current) => ({ ...current, baseUrl: event.target.value }))}
                disabled={!aiSettingsForm.isEnabled}
                placeholder={t.baseUrlPlaceholder}
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                {t.model}
              </label>
              <Input
                name="ai-model"
                autoComplete="off"
                value={aiSettingsForm.model}
                onChange={(event) => updateAiSettingsForm((current) => ({ ...current, model: event.target.value }))}
                disabled={!aiSettingsForm.isEnabled}
                placeholder={t.modelPlaceholder}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
              {t.apiKey}
            </label>
            <Input
              type="password"
              name="ai-api-key"
              autoComplete="new-password"
              value={aiSettingsForm.apiKey}
              onChange={(event) => updateAiSettingsForm((current) => ({ ...current, apiKey: event.target.value }))}
              disabled={!aiSettingsForm.isEnabled}
              placeholder={t.apiKeyPlaceholder}
            />
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">{t.apiKeyHint}</p>
          </div>

          <div className="border-t border-[var(--color-border-soft)] pt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                {t.markdownStylingPromptLabel}
              </label>
              <button
                type="button"
                onClick={() => setIsDefaultPromptModalOpen(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--color-brand-forest)] transition-colors hover:bg-[var(--color-brand-forest-soft)]"
                title={t.viewDefaultPrompt}
              >
                <HelpCircle size={14} />
                {t.viewDefaultPrompt}
              </button>
            </div>
            <Textarea
              name="ai-markdown-prompt"
              value={aiSettingsForm.markdownStylingSystemPrompt}
              onChange={(event) => updateAiSettingsForm((current) => ({ ...current, markdownStylingSystemPrompt: event.target.value }))}
              disabled={!aiSettingsForm.isEnabled}
              placeholder={t.markdownStylingPromptPlaceholder}
              rows={6}
              className="font-mono text-[13px] leading-5"
            />
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">{t.markdownStylingPromptHint}</p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="primary" onClick={saveAiSettings} disabled={aiSettingsMutation.isPending}>
              <Check size={14} />
              {aiSettingsMutation.isPending ? '...' : t.saveAiSettings}
            </Button>
            <Button onClick={() => aiConnectionCheckMutation.mutate()} disabled={aiConnectionCheckMutation.isPending}>
              <Sparkles size={14} />
              {aiConnectionCheckMutation.isPending ? '...' : t.checkAiConnection}
            </Button>
            <Button variant="danger" onClick={() => resetAiSettingsMutation.mutate()} disabled={resetAiSettingsMutation.isPending}>
              <Trash2 size={14} />
              {resetAiSettingsMutation.isPending ? '...' : t.resetAiSettings}
            </Button>
          </div>
        </form>

        {aiCheckResult ? (
          <div className="mt-6 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] p-4">
            <p className="font-semibold text-[var(--color-ink-strong)]">{t.aiCheckResultTitle}</p>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{aiCheckResult.message}</p>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
              {t.aiModelExample}
            </p>
            <Textarea readOnly value={aiCheckResult.styledText} rows={6} className="font-mono text-[13px] leading-6" />
          </div>
        ) : null}
      </Card>

      {isDefaultPromptModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl">
            <div className="border-b border-[var(--color-border-soft)] px-6 py-5">
              <h2 className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.defaultPromptModalTitle}</h2>
            </div>
            <div className="space-y-6 px-6 py-5">
              <div className="rounded-lg bg-[var(--color-brand-forest-soft)] p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-forest)]">
                  <HelpCircle size={16} />
                  {t.currentPrompt}
                </p>
                <div className="rounded bg-white p-3">
                  <p className="m-0 text-xs text-[var(--color-ink-muted)]">
                    {aiSettingsForm.markdownStylingSystemPrompt
                      ? `${t.customPrompt} — ${aiSettingsForm.markdownStylingSystemPrompt.substring(0, 100)}...`
                      : t.defaultPrompt}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
                  {t.defaultPrompt}
                </p>
                <Textarea
                  readOnly
                  value={t.defaultMarkdownPrompt}
                  rows={8}
                  className="font-mono text-[12px] leading-5 bg-[var(--color-surface-muted)]"
                />
              </div>

              <p className="m-0 text-xs text-[var(--color-ink-muted)]">💡 {t.promptReplacementWarning}</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
              <Button variant="ghost" onClick={() => setIsDefaultPromptModalOpen(false)}>
                {locale.common.cancel}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export default AdminAiSettingsPage;
