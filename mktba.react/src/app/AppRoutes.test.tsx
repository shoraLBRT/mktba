import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MazhabProvider } from '../context/MazhabProvider';
import { LocalizationProvider } from '../localization/provider';
import { getArticleContentById, getArticleContentBySlug } from '../services/Article/articleService';
import { getCurrentUser } from '../services/authService';
import { getNavigationTree } from '../services/Article/navigationService';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { clearSession, sessionHttp, setSignedIn, startSession } from '../services/session';
import { ApiError } from '../shared/api-client/apiError';
import { AppRoutes } from './AppRoutes';
import { createQueryClient } from './queryClient';
import type { ArticleContentDto, UserRole } from '../shared/types/ApiTypes';

const article = (slug: string): ArticleContentDto => ({ id: 7, title: 'Намаз', slug, paragraphs: [], tags: [] });

vi.mock('../services/Article/articleService', () => ({ getArticleContentById: vi.fn(), getArticleContentBySlug: vi.fn() }));
vi.mock('../services/Article/navigationService', () => ({ getNavigationTree: vi.fn() }));
vi.mock('../services/schoolService', () => ({ getSchoolsByArticleId: vi.fn(), getSystemSchools: vi.fn() }));
vi.mock('../pages/AddArticlePage', () => ({ default: () => <p>add-article-page</p> }));
vi.mock('../pages/AdminLoginPage', () => ({ default: () => <p>admin-login-page</p> }));
vi.mock('../services/authService', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../pages/admin/AdminDashboardPage', () => ({ default: () => <p>admin-dashboard-page</p> }));
vi.mock('../pages/admin/AdminArticlesPage', () => ({ default: () => <p>admin-articles-page</p> }));
vi.mock('../pages/admin/AdminArticleTreePage', () => ({ default: () => <p>admin-article-tree-page</p> }));
vi.mock('../pages/admin/AdminAiSettingsPage', () => ({ default: () => <p>admin-ai-page</p> }));
vi.mock('../pages/admin/AdminUsersPage', () => ({ default: () => <p>admin-users-page</p> }));
vi.mock('../pages/admin/AdminSessionsPage', () => ({ default: () => <p>admin-sessions-page</p> }));
vi.mock('../pages/admin/AdminMaintenancePage', () => ({ default: () => <p>admin-maintenance-page</p> }));
vi.mock('../pages/EditArticlePage', () => ({ default: () => <p>edit-article-page</p> }));

const signInAs = (role: UserRole) => {
  setSignedIn({ accessToken: 'token-1', email: `${role.toLowerCase()}@mktba.test` });
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 1, email: `${role.toLowerCase()}@mktba.test`, role });
};

const CurrentPath = () => <p data-testid="path">{useLocation().pathname}</p>;

const renderAt = (path: string) =>
  render(
    <LocalizationProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MazhabProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
            <CurrentPath />
          </MemoryRouter>
        </MazhabProvider>
      </QueryClientProvider>
    </LocalizationProvider>,
  );

beforeEach(() => {
  clearSession();
  vi.mocked(getNavigationTree).mockResolvedValue([]);
  vi.mocked(getSystemSchools).mockResolvedValue([]);
  vi.mocked(getSchoolsByArticleId).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppRoutes', () => {
  it('given an unknown route, when rendered, then shows the 404 page with a link home', () => {
    renderAt('/no/such/page');

    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/');
  });

  it('given the public header, when rendered, then shows no service tabs for the unbuilt Blog and Q&A', () => {
    renderAt('/no/such/page');

    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/Blog|Q&A|скоро/);
    expect(screen.queryByRole('button', { name: /Blog|Q&A/ })).toBeNull();
  });

  it('given an admin on the old create path, when rendered, then redirects to the admin create page', async () => {
    signInAs('Admin');

    renderAt('/article/new');

    expect(await screen.findByText('add-article-page')).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe('/admin/articles/new');
  });

  it('given a guest on the create page, when rendered, then sends them to the login page', () => {
    renderAt('/admin/articles/new');

    expect(screen.getByText('admin-login-page')).toBeTruthy();
    expect(screen.queryByText('add-article-page')).toBeNull();
  });

  it('given a session still being restored after a reload, when an admin page renders, then it waits instead of sending them to the login page', () => {
    localStorage.setItem('mktba.signedIn', '1');
    const refresh = vi.spyOn(sessionHttp, 'post').mockReturnValue(new Promise(() => {}));
    void startSession();

    renderAt('/admin/articles/new');

    expect(screen.queryByText('admin-login-page')).toBeNull();
    expect(screen.getByTestId('path').textContent).toBe('/admin/articles/new');
    refresh.mockRestore();
  });

  it('given an article the API does not have, when opened, then shows the 404 page at once', async () => {
    vi.mocked(getArticleContentById).mockRejectedValue(new ApiError('Article not found', 404));

    renderAt('/article/999');

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
    expect(getArticleContentById).toHaveBeenCalledTimes(1);
  });

  it('given a slug, when opened, then loads the article by slug and keeps the URL', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(article('namaz'));

    renderAt('/article/namaz');

    expect(await screen.findByRole('heading', { name: 'Намаз', level: 1 })).toBeTruthy();
    expect(getArticleContentBySlug).toHaveBeenCalledWith('namaz');
    expect(getArticleContentById).not.toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/article/namaz');
  });

  it('given an unknown slug, when opened, then shows the 404 page', async () => {
    vi.mocked(getArticleContentBySlug).mockRejectedValue(new ApiError('Article not found', 404));

    renderAt('/article/no-such-article');

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
  });

  it('given an old numeric id link, when opened, then replaces the URL with the slug URL', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article('namaz'));

    renderAt('/article/7');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/article/namaz'));
    expect(getArticleContentById).toHaveBeenCalledWith(7);
  });

  it('given an old slug, when the API answers with the current one, then replaces the URL with it', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(article('salat'));

    renderAt('/article/namaz');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/article/salat'));
  });
});

const sectionLinks = () =>
  screen.getAllByRole('navigation', { name: 'Разделы админки' })[0]
    .querySelectorAll('a');

describe('AdminLayout', () => {
  it('given an admin, when the admin opens, then the menu lists every section and the public search is gone', async () => {
    signInAs('Admin');

    renderAt('/admin');

    expect(await screen.findByText('admin-dashboard-page')).toBeTruthy();
    expect([...sectionLinks()].map((link) => link.textContent)).toEqual([
      'Обзор',
      'Статьи',
      'Пользователи и приглашения',
      'Сессии',
      'ИИ-провайдер',
      'Обслуживание базы',
    ]);
    expect(screen.queryByPlaceholderText('Поиск')).toBeNull();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy();
    expect(screen.getByTestId('admin-current-user').textContent).toContain('admin@mktba.test');
  });

  it('given an author, when the admin opens, then the menu hides the admin-only sections', async () => {
    signInAs('Author');

    renderAt('/admin');

    expect(await screen.findByText('admin-dashboard-page')).toBeTruthy();
    expect([...sectionLinks()].map((link) => link.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/articles',
      '/admin/sessions',
    ]);
  });

  it('given an author on an admin-only URL, when it opens, then shows the 403 view instead of the page', async () => {
    signInAs('Author');

    renderAt('/admin/ai');

    expect(await screen.findByRole('heading', { name: 'Нет доступа' })).toBeTruthy();
    expect(screen.queryByText('admin-ai-page')).toBeNull();
  });

  it('given a reader, when the admin opens, then lands on the first section they may open', async () => {
    signInAs('Reader');

    renderAt('/admin');

    expect(await screen.findByText('admin-sessions-page')).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe('/admin/sessions');
  });

  it.each([
    ['aiProvider', '/admin/ai', 'admin-ai-page'],
    ['adminAccess', '/admin/users', 'admin-users-page'],
    ['sessions', '/admin/sessions', 'admin-sessions-page'],
    ['cleanup', '/admin/maintenance', 'admin-maintenance-page'],
    ['articles', '/admin', 'admin-dashboard-page'],
  ])('given an old ?section=%s link, when opened, then redirects to %s', async (section, path, page) => {
    signInAs('Admin');

    renderAt(`/admin?section=${section}`);

    expect(await screen.findByText(page)).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe(path);
  });

  it('given a public page, when rendered, then it keeps the article tree search and has no admin menu', () => {
    renderAt('/');

    expect(screen.getAllByPlaceholderText('Поиск').length).toBeGreaterThan(0);
    expect(screen.queryByRole('navigation', { name: 'Разделы админки' })).toBeNull();
  });
});
