import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import type { AiProviderSettingsDto } from '../../shared/types/ApiTypes';
import { AI_SETTINGS_PATH, getAiAvailability, type AiAvailability } from './aiAvailability';
import { EditorToolbar } from './EditorToolbar';

const noop = () => {};

const aiButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /Улучшить с ИИ/ });

const renderToolbar = (aiAvailability: AiAvailability) =>
  render(
    <LocalizationProvider>
      <MemoryRouter>
        <EditorToolbar
          disabled={false}
          isPreview={false}
          aiAvailability={aiAvailability}
          isAiRunning={false}
          isSaving={false}
          onTogglePreview={noop}
          onImport={noop}
          onImproveAll={noop}
          onSave={noop}
        />
      </MemoryRouter>
    </LocalizationProvider>,
  );

const settings = (overrides: Partial<AiProviderSettingsDto>): AiProviderSettingsDto => ({
  baseUrl: '',
  model: '',
  isEnabled: false,
  hasApiKey: false,
  isConfigured: false,
  markdownStylingSystemPrompt: null,
  ...overrides,
});

describe('getAiAvailability', () => {
  it('is pending while the settings are loading', () => {
    expect(getAiAvailability(undefined)).toBe('pending');
  });

  it('is not configured on a fresh install, even when switched on', () => {
    expect(getAiAvailability(settings({ isEnabled: true, hasApiKey: true }))).toBe('notConfigured');
  });

  it('is disabled when configured but switched off', () => {
    expect(getAiAvailability(settings({ isConfigured: true }))).toBe('disabled');
  });

  it('is ready when configured and switched on', () => {
    expect(getAiAvailability(settings({ isConfigured: true, isEnabled: true }))).toBe('ready');
  });
});

describe('EditorToolbar AI button', () => {
  it('given no configured provider, disables the button and links to the AI settings', () => {
    renderToolbar('notConfigured');

    expect(aiButton().disabled).toBe(true);
    expect(screen.getByText(/ИИ не настроен/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Открыть настройки ИИ' }).getAttribute('href')).toBe(AI_SETTINGS_PATH);
  });

  it('given a configured but disabled provider, explains it is switched off', () => {
    renderToolbar('disabled');

    expect(aiButton().disabled).toBe(true);
    expect(screen.getByText(/ИИ выключен в настройках/)).toBeTruthy();
  });

  it('given a ready provider, enables the button without a hint', () => {
    renderToolbar('ready');

    expect(aiButton().disabled).toBe(false);
    expect(screen.queryByRole('link', { name: 'Открыть настройки ИИ' })).toBeNull();
  });

  it('while the settings load, keeps the button disabled without a hint', () => {
    renderToolbar('pending');

    expect(aiButton().disabled).toBe(true);
    expect(screen.queryByText(/ИИ не настроен/)).toBeNull();
  });
});
