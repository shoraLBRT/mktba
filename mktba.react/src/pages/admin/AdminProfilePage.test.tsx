import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getMyProfile, updateMyProfile } from '../../services/profileService';
import type { UserProfileDto } from '../../shared/types/ApiTypes';
import AdminProfilePage from './AdminProfilePage';

vi.mock('../../services/profileService', () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));

const fetchProfile = vi.mocked(getMyProfile);
const saveProfile = vi.mocked(updateMyProfile);

const profile = (patch: Partial<UserProfileDto> = {}): UserProfileDto => ({
  userId: 7,
  role: 'Author',
  displayName: null,
  slug: null,
  avatarUrl: null,
  bio: null,
  degree: null,
  institution: null,
  links: [],
  isPublic: false,
  ...patch,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <AdminProfilePage />
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const nameInput = () => screen.getByLabelText(/^Имя/) as HTMLInputElement;
const slugInput = () => screen.getByLabelText(/^Адрес профиля/) as HTMLInputElement;

describe('AdminProfilePage', () => {
  beforeEach(() => {
    fetchProfile.mockReset().mockResolvedValue(profile());
    saveProfile.mockReset();
  });

  it('given an empty profile, when it opens, then says the profile is hidden without a name', async () => {
    renderPage();

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    expect((await screen.findByTestId('profile-visibility')).textContent).toContain('без имени');
    expect(nameInput().value).toBe('');
  });

  it('given a typed name, when the slug is left empty, then the slug field previews the address and the save sends no slug', async () => {
    saveProfile.mockResolvedValue(profile({ displayName: 'Иван Иванов', slug: 'ivan-ivanov' }));
    renderPage();
    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: ' Иван Иванов ' } });
    fireEvent.change(screen.getByLabelText(/^О себе/), { target: { value: 'Пишу о фикхе' } });
    expect(slugInput().placeholder).toBe('ivan-ivanov');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0]).toEqual({
      displayName: 'Иван Иванов',
      slug: null,
      avatarUrl: null,
      bio: 'Пишу о фикхе',
      degree: null,
      institution: null,
      links: [],
    });
    expect(await screen.findByText('Профиль сохранён')).toBeTruthy();
    expect(slugInput().value).toBe('ivan-ivanov');
    expect(screen.getByTestId('profile-visibility').textContent).toContain('когда выйдет хотя бы одна ваша статья');
  });

  it('given a saved public profile, when it opens, then shows its values and that readers see it', async () => {
    fetchProfile.mockResolvedValue(
      profile({ displayName: 'Иван', slug: 'ivan', isPublic: true, links: [{ label: 'Сайт', url: 'https://example.com' }] }),
    );

    renderPage();

    await waitFor(() => expect(nameInput().value).toBe('Иван'));
    expect(slugInput().value).toBe('ivan');
    expect((screen.getByLabelText('Адрес ссылки 1') as HTMLInputElement).value).toBe('https://example.com');
    expect(screen.getByTestId('profile-visibility').textContent).toBe('Профиль открыт читателям.');
  });

  it('given a link with a bad address, when saving, then warns and does not call the API', async () => {
    renderPage();
    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: 'Иван' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить ссылку' }));
    fireEvent.change(screen.getByLabelText('Подпись ссылки 1'), { target: { value: 'Сайт' } });
    fireEvent.change(screen.getByLabelText('Адрес ссылки 1'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    expect(await screen.findByText('Адрес ссылки должен начинаться с http:// или https://.')).toBeTruthy();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('given the API refuses the save, when saving, then shows its message and keeps what was typed', async () => {
    saveProfile.mockRejectedValue(new Error('Адрес профиля «ivan» уже занят другим пользователем.'));
    renderPage();
    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: 'Иван' } });
    fireEvent.change(slugInput(), { target: { value: 'ivan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    expect(await screen.findByText(/уже занят другим пользователем/)).toBeTruthy();
    expect(nameInput().value).toBe('Иван');
  });
});
