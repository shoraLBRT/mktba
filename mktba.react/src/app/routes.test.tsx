import { render, screen, waitFor } from '@testing-library/react';
import { createRoutesStub, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../root';
import AdminRoute from '../routes/admin';
import AdminLoginRoute from '../routes/admin-login';
import ArticleRoute, * as articleRoute from '../routes/article';
import HomeRoute, * as homeRoute from '../routes/home';
import LegacyAddArticleRoute, * as legacyAddArticleRoute from '../routes/legacy-add-article';
import NotFoundRoute, * as notFoundRoute from '../routes/not-found';
import PublicLayoutRoute, * as publicLayoutRoute from '../routes/public-layout';
import { getArticleContentById, getArticleContentBySlug, getRecentArticles } from '../services/Article/articleService';
import { getCurrentUser } from '../services/authService';
import { getNavigationTree } from '../services/Article/navigationService';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { clearSession, sessionHttp, setSignedIn, startSession } from '../services/session';
import { ApiError } from '../shared/api-client/apiError';
import type { ArticleContentDto, UserRole } from '../shared/types/ApiTypes';

const article = (slug: string): ArticleContentDto => ({ id: 7, title: 'Намаз', slug, paragraphs: [], tags: [] });

vi.mock('../services/Article/articleService', () => ({ getArticleContentById: vi.fn(), getArticleContentBySlug: vi.fn(), getRecentArticles: vi.fn() }));
vi.mock('../services/Article/navigationService', () => ({ getNavigationTree: vi.fn() }));
vi.mock('../services/schoolService', () => ({ getSchoolsByArticleId: vi.fn(), getSystemSchools: vi.fn() }));
vi.mock('../pages/ArticleEditorPage', () => ({ default: () => <p>article-editor-page</p> }));
vi.mock('../pages/AdminLoginPage', () => ({ default: () => <p>admin-login-page</p> }));
vi.mock('../services/authService', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../pages/admin/AdminDashboardPage', () => ({ default: () => <p>admin-dashboard-page</p> }));
vi.mock('../pages/admin/AdminArticlesPage', () => ({ default: () => <p>admin-articles-page</p> }));
vi.mock('../pages/admin/AdminArticleTreePage', () => ({ default: () => <p>admin-article-tree-page</p> }));
vi.mock('../pages/admin/AdminAiSettingsPage', () => ({ default: () => <p>admin-ai-page</p> }));
vi.mock('../pages/admin/AdminUsersPage', () => ({ default: () => <p>admin-users-page</p> }));
vi.mock('../pages/admin/AdminSessionsPage', () => ({ default: () => <p>admin-sessions-page</p> }));
vi.mock('../pages/admin/AdminMaintenancePage', () => ({ default: () => <p>admin-maintenance-page</p> }));

const signInAs = (role: UserRole) => {
  setSignedIn({ accessToken: 'token-1', email: `${role.toLowerCase()}@mktba.test` });
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 1, email: `${role.toLowerCase()}@mktba.test`, role });
};

const CurrentPath = () => <p data-testid="path">{useLocation().pathname}</p>;

/**
 * The route tree of src/routes.ts with the browser's loaders, as after the first page: the server
 * loaders are covered by the e2e SSR test.
 */
const RoutesStub = createRoutesStub([
  {
    id: 'root',
    loader: () => ({ siteUrl: 'https://mktba.test' }),
    Component: () => (
      <>
        <App />
        <CurrentPath />
      </>
    ),
    children: [
      {
        Component: PublicLayoutRoute,
        loader: publicLayoutRoute.clientLoader,
        children: [
          { index: true, Component: HomeRoute, loader: homeRoute.clientLoader, handle: homeRoute.handle },
          { path: 'article/new', Component: LegacyAddArticleRoute, loader: legacyAddArticleRoute.clientLoader },
          { path: 'article/:slug', Component: ArticleRoute, loader: articleRoute.clientLoader, handle: articleRoute.handle },
          { path: ':slug', Component: ArticleRoute, loader: articleRoute.clientLoader, handle: articleRoute.handle },
          { path: 'admin/login', Component: AdminLoginRoute },
          { path: '*', Component: NotFoundRoute, loader: notFoundRoute.clientLoader, handle: notFoundRoute.handle },
        ],
      },
      { path: 'admin/*', Component: AdminRoute },
    ],
  },
]);

const renderAt = (path: string) => render(<RoutesStub initialEntries={[path]} />);

beforeEach(() => {
  clearSession();
  vi.mocked(getNavigationTree).mockResolvedValue([]);
  vi.mocked(getRecentArticles).mockResolvedValue({ new: [], updated: [] });
  vi.mocked(getSystemSchools).mockResolvedValue([]);
  vi.mocked(getSchoolsByArticleId).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppRoutes', () => {
  it('given an unknown route, when rendered, then shows the 404 page with a link home', async () => {
    renderAt('/no/such/page');

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/');
  });

  it('given an unknown route, when rendered, then its head carries the 404 title and robots noindex', async () => {
    renderAt('/no/such/page');

    await screen.findByRole('heading', { name: 'Страница не найдена' });
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(document.title).toBe('Страница не найдена — mktba');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('given the home page, when rendered, then its head carries the site title and its canonical URL', async () => {
    renderAt('/');

    await waitFor(() => expect(document.title).toBe('mktba — исламская wiki'));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.test/');
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('given the sign-in page, when rendered, then its head forbids indexing and following', async () => {
    renderAt('/admin/login');

    await screen.findByText('admin-login-page');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
  });

  it('given the public header, when rendered, then shows no service tabs for the unbuilt Blog and Q&A', async () => {
    renderAt('/no/such/page');

    const header = await screen.findByRole('banner');
    expect(header.textContent).not.toMatch(/Blog|Q&A|скоро/);
    expect(screen.queryByRole('button', { name: /Blog|Q&A/ })).toBeNull();
  });

  it('given an admin on the old create path, when rendered, then redirects to the admin create page', async () => {
    signInAs('Admin');

    renderAt('/article/new');

    expect(await screen.findByText('article-editor-page')).toBeTruthy();
    expect(screen.getByTestId('path').textContent).toBe('/admin/articles/new');
  });

  it('given a guest on the create page, when rendered, then sends them to the login page', async () => {
    renderAt('/admin/articles/new');

    expect(await screen.findByText('admin-login-page')).toBeTruthy();
    expect(screen.queryByText('article-editor-page')).toBeNull();
  });

  it('given a session still being restored after a reload, when an admin page renders, then it waits instead of sending them to the login page', async () => {
    localStorage.setItem('mktba.signedIn', '1');
    const refresh = vi.spyOn(sessionHttp, 'post').mockReturnValue(new Promise(() => {}));
    void startSession();

    renderAt('/admin/articles/new');

    expect((await screen.findByTestId('path')).textContent).toBe('/admin/articles/new');
    expect(screen.queryByText('admin-login-page')).toBeNull();
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

    renderAt('/namaz');

    expect(await screen.findByRole('heading', { name: 'Намаз', level: 1 })).toBeTruthy();
    expect(getArticleContentBySlug).toHaveBeenCalledWith('namaz');
    expect(getArticleContentById).not.toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/namaz');
  });

  it('given an old /article/{slug} URL, when opened, then replaces it with /{slug} keeping the query', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(article('namaz'));

    renderAt('/article/namaz?mazhab=hanafi');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/namaz'));
    expect(getArticleContentBySlug).toHaveBeenCalledWith('namaz');
  });

  it('given an unknown slug, when opened, then shows the 404 page', async () => {
    vi.mocked(getArticleContentBySlug).mockRejectedValue(new ApiError('Article not found', 404));

    renderAt('/no-such-article');

    expect(await screen.findByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
  });

  it('given an old numeric id link, when opened, then replaces the URL with the slug URL', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article('namaz'));

    renderAt('/article/7');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/namaz'));
    expect(getArticleContentById).toHaveBeenCalledWith(7);
  });

  it('given an old slug, when the API answers with the current one, then replaces the URL with it', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(article('salat'));

    renderAt('/namaz');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/salat'));
  });
});

const headingLevels = () =>
  [...document.body.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => Number(heading.tagName[1]));

const richArticle: ArticleContentDto = {
  ...article('namaz'),
  publishedAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-19T10:00:00Z',
  paragraphs: [
    { id: 1, order: 1, opinions: [{ id: 11, content: '# Условия\n\n### Время', isDefault: true, schoolIds: [], sources: [] }] },
    {
      id: 2,
      order: 2,
      opinions: [
        { id: 21, content: '## Порядок\n\n![Схема](/scheme.png)', isDefault: true, schoolIds: [], sources: [] },
        { id: 22, content: '#### Иной порядок', isDefault: false, schoolIds: [], sources: [] },
      ],
    },
  ],
};

describe('Page semantics', () => {
  it.each(['/', '/no/such/page'])('given %s, when rendered, then the page has exactly one h1 inside one main', async (path) => {
    renderAt(path);

    await screen.findByRole('heading', { level: 1 });
    expect(document.body.querySelectorAll('h1')).toHaveLength(1);
    expect(document.body.querySelectorAll('main')).toHaveLength(1);
    expect(document.body.querySelector('main h1')).toBeTruthy();
  });

  it('given an article with markdown headings, when rendered, then it has one h1 and heading levels never skip', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(richArticle);

    renderAt('/namaz');

    await screen.findByRole('heading', { name: 'Намаз', level: 1 });
    const levels = headingLevels();
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((level, index) => {
      if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
    });
  });

  it('given an article, when rendered, then landmarks, breadcrumbs, dates and image alt are marked up', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(richArticle);

    renderAt('/namaz');

    await screen.findByRole('heading', { name: 'Намаз', level: 1 });
    expect(document.body.querySelectorAll('main')).toHaveLength(1);
    expect(document.body.querySelector('main article h1')?.textContent).toBe('Намаз');
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getAllByRole('navigation', { name: 'Статьи' }).length).toBeGreaterThan(0);
    expect([...document.body.querySelectorAll('article time')].map((time) => time.getAttribute('datetime'))).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-19T10:00:00.000Z',
    ]);
    expect(document.body.querySelector('article img')?.getAttribute('alt')).toBe('Схема');
  });

  it('given a stub article under a stub section, when rendered, then the header still shows its breadcrumbs and no reading time', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(article('namaz'));
    vi.mocked(getNavigationTree).mockResolvedValue([
      {
        id: 1,
        title: 'Столпы ислама',
        slug: 'stolpy',
        hasContent: false,
        children: [{ id: 7, title: 'Намаз', slug: 'namaz', hasContent: false, children: [] }],
      },
    ] as unknown as Awaited<ReturnType<typeof getNavigationTree>>);

    renderAt('/namaz');

    const trail = await screen.findByRole('navigation', { name: 'Путь к статье' });
    await waitFor(() =>
      expect([...trail.querySelectorAll('li')].map((step) => step.textContent)).toEqual(['Главная', 'Столпы ислама', 'Намаз']));
    expect(trail.querySelector('li[aria-current="page"]')?.textContent).toBe('Намаз');
    expect([...trail.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(['/']);
    expect(screen.queryByTestId('article-reading-time')).toBeNull();
  });

  it('given an article with text, when rendered, then the header shows the reading time by the default opinions', async () => {
    vi.mocked(getArticleContentBySlug).mockResolvedValue(richArticle);

    renderAt('/namaz');

    expect((await screen.findByTestId('article-reading-time')).textContent).toContain('1 мин чтения');
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
      'Теги',
      'Пользователи и приглашения',
      'Сессии',
      'Мой профиль',
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
      '/admin/profile',
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

  it('given a public page, when rendered, then it keeps the article tree search and has no admin menu', async () => {
    renderAt('/');

    expect((await screen.findAllByPlaceholderText('Поиск')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('navigation', { name: 'Разделы админки' })).toBeNull();
  });
});
