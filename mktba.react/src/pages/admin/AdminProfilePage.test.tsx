import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getMyProfile, updateMyProfile, uploadAvatar } from '../../services/profileService';
import type { UserProfileDto } from '../../shared/types/ApiTypes';
import AdminProfilePage from './AdminProfilePage';

vi.mock('../../services/profileService', () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

const fetchProfile = vi.mocked(getMyProfile);
const saveProfile = vi.mocked(updateMyProfile);
const upload = vi.mocked(uploadAvatar);

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
    upload.mockReset();
  });

  it('given an empty profile, when it opens, then says the profile is hidden without a name', async () => {
    renderPage();

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    expect((await screen.findByTestId('profile-visibility')).textContent).toContain('без имени');
    expect(nameInput().value).toBe('');
  });

  it('given the saved profile still loading, when the page opens, then nothing can be typed until it is in, and the saved name then shows unchanged', async () => {
    let resolveProfile: (value: UserProfileDto) => void = () => undefined;
    fetchProfile.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
    renderPage();

    expect(nameInput().matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Сохранить профиль' }).matches(':disabled')).toBe(true);

    resolveProfile(profile({ displayName: 'Иван Иванов', slug: 'ivan-ivanov' }));

    await waitFor(() => expect(nameInput().matches(':disabled')).toBe(false));
    expect(nameInput().value).toBe('Иван Иванов');
    fireEvent.change(nameInput(), { target: { value: 'Пётр' } });
    expect(nameInput().value).toBe('Пётр');
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

  it('given a picked image, when it is uploaded, then its address fills the avatar field and is saved with the profile', async () => {
    const url = 'http://localhost:5172/files/0123456789abcdef0123456789abcdef.webp';
    upload.mockResolvedValue({ url, contentType: 'image/webp', width: 512, height: 512, sizeBytes: 2048 });
    saveProfile.mockResolvedValue(profile({ avatarUrl: url }));
    renderPage();
    await waitFor(() => expect(nameInput().matches(':disabled')).toBe(false));
    const file = new File([new Uint8Array([0x89, 0x50])], 'me.png', { type: 'image/png' });

    fireEvent.change(screen.getByTestId('profile-avatar-file'), { target: { files: [file] } });

    await waitFor(() => expect((screen.getByLabelText(/^Ссылка на аватар/) as HTMLInputElement).value).toBe(url));
    expect(upload).toHaveBeenCalledWith(file, expect.anything());
    expect(screen.getByTestId('profile-avatar-preview').getAttribute('src')).toBe(url);
    expect(saveProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0].avatarUrl).toBe(url);
  });

  it('given a picked file that is too large or not an image, when picked, then nothing is uploaded and the reason is shown', async () => {
    renderPage();
    await waitFor(() => expect(nameInput().matches(':disabled')).toBe(false));
    const huge = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' });
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });

    fireEvent.change(screen.getByTestId('profile-avatar-file'), { target: { files: [huge] } });
    expect(await screen.findByText('Файл больше 10 МБ.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('profile-avatar-file'), { target: { files: [svg] } });
    expect(await screen.findByText('Подойдёт картинка JPEG, PNG или WebP.')).toBeTruthy();

    expect(upload).not.toHaveBeenCalled();
  });
});
