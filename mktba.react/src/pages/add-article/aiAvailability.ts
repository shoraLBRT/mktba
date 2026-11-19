import type { AiProviderSettingsDto } from '../../shared/types/ApiTypes';

/**
 * Whether the editor may offer «Улучшить с ИИ». There is no default AI provider (decision D8):
 * until an admin configures one, AI stays off and the editor explains where to set it up.
 */
export type AiAvailability = 'pending' | 'ready' | 'notConfigured' | 'disabled';

export const getAiAvailability = (settings: AiProviderSettingsDto | undefined): AiAvailability => {
  if (!settings) {
    return 'pending';
  }
  if (!settings.isConfigured) {
    return 'notConfigured';
  }
  return settings.isEnabled ? 'ready' : 'disabled';
};

/** Admin page link that opens the AI provider settings section. */
export const AI_SETTINGS_PATH = '/admin?section=aiProvider';
