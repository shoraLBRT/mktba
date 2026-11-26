import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteUrlContext } from '../app/siteUrl';
import { LocalizationProvider } from '../localization/provider';
import { getAuthor, getAuthorArticles } from '../services/authorService';
import { ApiError } from '../shared/api-client/apiError';
import { authorArticlesQueryKey, authorQueryKey } from '../shared/author';
import type { AuthorArticlesDto, PublicProfileDto } from '../shared/types/ApiTypes';
import AuthorPage from './AuthorPage';

vi.mock('../services/authorService', () => ({ getAuthor: vi.fn(), getAuthorArticles: vi.fn() }));

const profile = (overrides: Partial<PublicProfileDto> = {}): PublicProfileDto => ({
  slug: 'ivan-ivanov',
  displayName: 'Иван Иванов',
  role: 'Author',
  avatarUrl: 'https://example.com/a.png',
  bio: 'Пишу о фикхе.\nПреподаю.',
  degree: null,
  institution: null,
  links: [{ label: 'Сайт', url: 'https://example.com/me' }],
  ...overrides,
});

const articles = (overrides: Partial<AuthorArticlesDto> = {}): AuthorArticlesDto => ({
  total: 2,
  page: 1,
  pageSize: 20,
  items: [
    { id: 2, title: 'Условия намаза', slug: 'salat', summary: 'Кратко о намазе', publishedAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z' },
    { id: 1, title: 'Закят', slug: 'zakyat', summary: null, publishedAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
  ],
  ...overrides,
});

/** The page at `url` over a cache that already holds the profile and the list, as after the server render. */
const renderAuthor = (url: string, author?: PublicProfileDto, list?: AuthorArticlesDto) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (author) client.setQueryData(authorQueryKey(author.slug), author);
  if (author && list) client.setQueryData(authorArticlesQueryKey(author.slug, list.page, 'ru'), list);
  const Stub = createRoutesStub([{ path: '/authors/:slug', Component: AuthorPage }]);

  return render(
    <QueryClientProvider client={client}>
      <SiteUrlContext.Provider value="https://mktba.ru">
        <LocalizationProvider>
          <Stub initialEntries={[url]} />
        </LocalizationProvider>
      </SiteUrlContext.Provider>
    </QueryClientProvider>,
  );
};

const jsonLd = () =>
  JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as {
    '@graph': Array<Record<string, unknown>>;
  };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthorPage', () => {
  it('given an author with articles, when rendered, then shows the name, the role, the text, the links and the articles with dates', () => {
    renderAuthor('/authors/ivan-ivanov', profile(), articles());

    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual(['Иван Иванов']);
    expect(screen.getByTestId('author-role').textContent).toBe('Автор');
    expect(screen.getByText(/Пишу о фикхе/).textContent).toBe('Пишу о фикхе.\nПреподаю.');
    const link = within(screen.getByRole('list', { name: 'Ссылки автора' })).getByRole('link', { name: 'Сайт' });
    expect(link.getAttribute('href')).toBe('https://example.com/me');
    expect(link.getAttribute('rel')).toBe('nofollow noopener');

    const items = within(screen.getByRole('region', { name: 'Статьи' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: 'Условия намаза' }).getAttribute('href')).toBe('/salat');
    expect(items[0].textContent).toContain('Кратко о намазе');
    expect(items[0].textContent).toContain('Опубликовано 2 ноября 2026 г.');
    expect(items[0].textContent).toContain('Обновлено 5 ноября 2026 г.');
    expect(items[1].textContent).toContain('Опубликовано 1 октября 2026 г.');
    expect(items[1].textContent).not.toContain('Обновлено');
    expect(screen.queryByRole('navigation', { name: 'Страницы списка статей' })).toBeNull();
  });

  it('given an avatar address, when rendered, then the image is lazy, sized, sends no referrer, and gives way to the initial when it fails', () => {
    renderAuthor('/authors/ivan-ivanov', profile(), articles());

    const image = screen.getByRole('img', { name: 'Фото автора: Иван Иванов' });
    expect(image.getAttribute('src')).toBe('https://example.com/a.png');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(image.getAttribute('width')).toBe('96');
    expect(image.getAttribute('height')).toBe('96');

    fireEvent.error(image);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('author-avatar').textContent).toBe('И');
  });

  it('given no avatar, when rendered, then the initial stands in its place', () => {
    renderAuthor('/authors/ivan-ivanov', profile({ avatarUrl: null }), articles());

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('author-avatar').textContent).toBe('И');
  });

  it('given a scholar with a degree, when rendered, then it is shown as stated by the author, not as confirmed', () => {
    renderAuthor(
      '/authors/ivan-ivanov',
      profile({ role: 'Scholar', degree: 'Доктор шариатских наук', institution: 'Аль-Азхар' }),
      articles(),
    );

    expect(screen.getByTestId('author-role').textContent).toBe('Учёный');
    const block = screen.getByRole('region', { name: 'Об образовании' });
    expect(block.textContent).toContain('Доктор шариатских наук');
    expect(block.textContent).toContain('Аль-Азхар');
    expect(block.textContent).toContain('Указано самим автором');
    expect(document.body.textContent).not.toMatch(/подтвержд/i);
    expect(JSON.stringify(jsonLd())).not.toContain('Аль-Азхар');
  });

  it('given an author without a degree, when rendered, then there is no education block', () => {
    renderAuthor('/authors/ivan-ivanov', profile(), articles());

    expect(screen.queryByRole('region', { name: 'Об образовании' })).toBeNull();
  });

  it('given markup in the profile, when rendered, then it is shown as text and never becomes an element', () => {
    const { container } = renderAuthor(
      '/authors/ivan-ivanov',
      profile({ avatarUrl: null, bio: '<img src=x onerror=alert(1)>', displayName: '<b>Имя</b>' }),
      articles(),
    );

    expect(container.querySelector('img, b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('given the first page, when rendered, then the page is indexable with its canonical and a Person in the structured data', () => {
    renderAuthor('/authors/ivan-ivanov', profile(), articles());

    expect(document.title).toBe('Иван Иванов — mktba');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/authors/ivan-ivanov');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Пишу о фикхе. Преподаю.');
    const graph = jsonLd()['@graph'];
    expect(graph.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'ProfilePage', 'Person']);
    expect(graph[3]).toEqual({
      '@id': 'https://mktba.ru/authors/ivan-ivanov#person',
      '@type': 'Person',
      name: 'Иван Иванов',
      url: 'https://mktba.ru/authors/ivan-ivanov',
      description: 'Пишу о фикхе.\nПреподаю.',
      image: 'https://example.com/a.png',
      sameAs: ['https://example.com/me'],
    });
    expect(graph[2]).toMatchObject({ mainEntity: { '@id': 'https://mktba.ru/authors/ivan-ivanov#person' } });
  });

  it('given a later page of a long list, when rendered, then it links both ways and is kept out of the index', () => {
    renderAuthor('/authors/ivan-ivanov?page=2', profile(), articles({ total: 45, page: 2 }));

    const pages = screen.getByRole('navigation', { name: 'Страницы списка статей' });
    expect(pages.textContent).toContain('Страница 2 из 3');
    expect(within(pages).getByRole('link', { name: '← Назад' }).getAttribute('href')).toBe('/authors/ivan-ivanov');
    expect(within(pages).getByRole('link', { name: 'Вперёд →' }).getAttribute('href')).toBe('/authors/ivan-ivanov?page=3');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('given an author whose articles readers cannot open, when rendered, then says there are none', () => {
    renderAuthor('/authors/ivan-ivanov', profile(), articles({ total: 0, items: [] }));

    expect(screen.getByRole('region', { name: 'Статьи' }).textContent).toContain('У автора пока нет статей, открытых читателям.');
  });

  it('given an author the API does not have, when opened in the browser, then the 404 page is shown', async () => {
    vi.mocked(getAuthor).mockRejectedValue(new ApiError('not found', 404, 'author_not_found'));
    vi.mocked(getAuthorArticles).mockRejectedValue(new ApiError('not found', 404, 'author_not_found'));

    renderAuthor('/authors/nobody');

    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });

  it('given the API failing, when opened in the browser, then says so and offers to try again', async () => {
    vi.mocked(getAuthor).mockRejectedValue(new ApiError('boom', 500));
    vi.mocked(getAuthorArticles).mockRejectedValue(new ApiError('boom', 500));

    renderAuthor('/authors/ivan-ivanov');

    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить страницу автора.');
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeTruthy();
  });
});
