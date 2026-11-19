import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MazhabProvider } from '../context/MazhabProvider';
import { LocalizationProvider } from '../localization/provider';
import { getArticleContentById, getArticleContentBySlug } from '../services/Article/articleService';
import { getNavigationTree } from '../services/Article/navigationService';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { clearSession, sessionHttp, setSignedIn, startSession } from '../services/session';
import { ApiError } from '../shared/api-client/apiError';
import { AppRoutes } from './AppRoutes';
import { createQueryClient } from './queryClient';
import type { ArticleContentDto } from '../shared/types/ApiTypes';

const article = (slug: string): ArticleContentDto => ({ id: 7, title: 'Намаз', slug, paragraphs: [], tags: [] });

vi.mock('../services/Article/articleService', () => ({ getArticleContentById: vi.fn(), getArticleContentBySlug: vi.fn() }));
vi.mock('../services/Article/navigationService', () => ({ getNavigationTree: vi.fn() }));
vi.mock('../services/schoolService', () => ({ getSchoolsByArticleId: vi.fn(), getSystemSchools: vi.fn() }));
vi.mock('../pages/AddArticlePage', () => ({ default: () => <p>add-article-page</p> }));
vi.mock('../pages/AdminLoginPage', () => ({ default: () => <p>admin-login-page</p> }));
vi.mock('../pages/AdminPage', () => ({ default: () => <p>admin-page</p> }));
vi.mock('../pages/EditArticlePage', () => ({ default: () => <p>edit-article-page</p> }));

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

  it('given an admin on the old create path, when rendered, then redirects to the admin create page', () => {
    setSignedIn({ accessToken: 'token-1', email: 'admin@mktba.test' });

    renderAt('/article/new');

    expect(screen.getByText('add-article-page')).toBeTruthy();
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
