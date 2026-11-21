import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getMyProfile, updateMyProfile, uploadAvatar } from '../../services/profileService';
import { ApiError } from '../../shared/api-client/apiError';
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
    expect(screen.getByTestId('profile-visibility').textContent).toBe('Профиль открыт читателям. Открыть страницу автора');
    expect(screen.getByRole('link', { name: 'Открыть страницу автора' }).getAttribute('href')).toBe('/authors/ivan');
    expect(screen.getByTestId('profile-address-preview').textContent).toBe(`Страница автора: ${window.location.origin}/authors/ivan`);
  });

  it('given a hidden profile, when a name is typed, then the address is previewed from it and there is no link to a page yet', async () => {
    renderPage();
    await waitFor(() => expect(nameInput().matches(':disabled')).toBe(false));
    expect(screen.queryByTestId('profile-address-preview')).toBeNull();

    fireEvent.change(nameInput(), { target: { value: 'Иван Иванов' } });
    expect(screen.getByTestId('profile-address-preview').textContent).toContain('/authors/ivan-ivanov');
    fireEvent.change(slugInput(), { target: { value: 'Ivan' } });
    expect(screen.getByTestId('profile-address-preview').textContent).toContain('/authors/ivan');

    expect(screen.queryByRole('link', { name: 'Открыть страницу автора' })).toBeNull();
  });

  it('given a link with a bad address, when saving, then warns and does not call the API', async () => {
    renderPage();
    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: 'Иван' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить ссылку' }));
    fireEvent.change(screen.getByLabelText('Подпись ссылки 1'), { target: { value: 'Сайт' } });
    fireEvent.change(screen.getByLabelText('Адрес ссылки 1'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    const url = screen.getByLabelText('Адрес ссылки 1');
    expect(url.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(url.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Адрес ссылки должен начинаться с http:// или https://.',
    );
    expect(document.activeElement).toBe(url);
    expect(screen.getByLabelText('Подпись ссылки 1').getAttribute('aria-invalid')).toBeNull();
    expect(saveProfile).not.toHaveBeenCalled();

    fireEvent.change(url, { target: { value: 'https://example.com' } });
    expect(url.getAttribute('aria-invalid')).toBeNull();
  });

  it('given a bad slug and avatar, when saving, then both fields say why and the first one takes the focus', async () => {
    renderPage();
    await waitFor(() => expect(nameInput().matches(':disabled')).toBe(false));
    fireEvent.change(slugInput(), { target: { value: 'ivan' } });
    fireEvent.change(screen.getByLabelText(/^Ссылка на аватар/), { target: { value: 'javascript:alert(1)' } });
    // No message before the first attempt to save.
    expect(slugInput().getAttribute('aria-invalid')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    expect(slugInput().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Чтобы задать адрес профиля, укажите имя.')).toBeTruthy();
    expect(screen.getByLabelText(/^Ссылка на аватар/).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(slugInput());
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('given the API says the slug is taken, when saving, then the message is at the slug field until it is changed', async () => {
    saveProfile.mockRejectedValue(new ApiError('Адрес профиля «ivan» уже занят.', 409, 'profile_slug_taken'));
    renderPage();
    await waitFor(() => expect(nameInput().matches(':disabled')).toBe(false));
    fireEvent.change(nameInput(), { target: { value: 'Иван' } });
    fireEvent.change(slugInput(), { target: { value: 'ivan' } });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }));

    await waitFor(() => expect(slugInput().getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(slugInput().getAttribute('aria-describedby') ?? '')?.textContent).toBe('Адрес профиля «ivan» уже занят.');
    expect(document.activeElement).toBe(slugInput());

    fireEvent.change(slugInput(), { target: { value: 'ivan-2' } });
    expect(slugInput().getAttribute('aria-invalid')).toBeNull();
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
