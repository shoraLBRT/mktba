import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MazhabProvider } from '../context/MazhabProvider';
import { LocalizationProvider } from '../localization/provider';
import { getArticleContentById } from '../services/Article/articleService';
import { getNavigationTree } from '../services/Article/navigationService';
import { isAdminAuthenticated } from '../services/authService';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { ApiError } from '../shared/api-client/apiError';
import { AppRoutes } from './AppRoutes';
import { createQueryClient } from './queryClient';

vi.mock('../services/authService', () => ({ isAdminAuthenticated: vi.fn() }));
vi.mock('../services/Article/articleService', () => ({ getArticleContentById: vi.fn() }));
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
  vi.mocked(isAdminAuthenticated).mockReturnValue(false);
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
    vi.mocked(isAdminAuthenticated).mockReturnValue(true);

    renderAt('/article/new');

    expect(screen.getByText('add-article-page')).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe('/admin/articles/new');
  });

  it('given a guest on the create page, when rendered, then sends them to the login page', () => {
    renderAt('/admin/articles/new');

    expect(screen.getByText('admin-login-page')).toBeTruthy();
    expect(screen.queryByText('add-article-page')).toBeNull();
  });

  it('given an article the API does not have, when opened, then shows the 404 page at once', async () => {
    vi.mocked(getArticleContentById).mockRejectedValue(new ApiError('Article not found', 404));

    renderAt('/article/999');

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
    expect(getArticleContentById).toHaveBeenCalledTimes(1);
  });

  it('given a non-numeric article id, when opened, then shows the 404 page without calling the API', () => {
    renderAt('/article/abc');

    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
    expect(getArticleContentById).not.toHaveBeenCalled();
  });
});
