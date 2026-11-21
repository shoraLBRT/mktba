import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { createArticle, moveArticle, updateArticle } from '../../services/adminService';
import { ApiError, translateApiError } from '../../shared/api-client/apiError';
import { resetNavigationTreeStateForTests } from '../../shared/navigationTreeState';
import type { ArticleReadDto, NavigationArticleDto } from '../../shared/types/ApiTypes';
import AdminArticleTreePage from './AdminArticleTreePage';

vi.mock('../../services/adminService', () => ({ createArticle: vi.fn(), moveArticle: vi.fn(), updateArticle: vi.fn() }));

const canEditAnyArticle = vi.hoisted(() => ({ value: true }));
vi.mock('../../auth/useCurrentUser', () => ({
  useCurrentUser: () => ({ can: (permission: string) => permission !== 'canEditAnyArticle' || canEditAnyArticle.value }),
}));

const node = (id: number, title: string, children: NavigationArticleDto[] = []) =>
  ({ id, title, slug: `a${id}`, status: 'Published', hasContent: true, canEdit: true, children }) as unknown as NavigationArticleDto;

const tree = [node(1, 'Намаз', [node(2, 'Условия'), node(3, 'Время', [node(5, 'Утро')])]), node(4, 'Пост')];

vi.mock('../../hooks/useNavigationTree', () => ({
  useNavigationTree: () => ({ data: tree, isLoading: false, error: null }),
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={['/admin/articles/tree']}>
          <AdminArticleTreePage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const rowOf = (title: string) => screen.getByRole('link', { name: title }).parentElement as HTMLElement;
const handleOf = (title: string) => within(rowOf(title)).getByTestId('tree-drag-handle');
const dataTransfer = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' });

/** Every row is 40px high from y = 0: the upper quarter is before, the middle inside, the lower quarter after. */
const rowRect = { top: 0, height: 40, bottom: 40, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

/** jsdom has no DragEvent, so the pointer's height is set on the generic event by hand. */
const fireAt = (type: 'dragOver' | 'drop', element: HTMLElement, transfer: object, clientY: number) => {
  const event = createEvent[type](element, { dataTransfer: transfer });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(element, event);
};

const drag = (from: string, to: string, clientY: number) => {
  const transfer = dataTransfer();
  fireEvent.dragStart(handleOf(from), { dataTransfer: transfer });
  fireAt('dragOver', rowOf(to), transfer, clientY);
  return { drop: () => fireAt('drop', rowOf(to), transfer, clientY) };
};

beforeEach(() => {
  resetNavigationTreeStateForTests();
  canEditAnyArticle.value = true;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rowRect);
  vi.mocked(moveArticle).mockResolvedValue({} as ArticleReadDto);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(createArticle).mockReset();
  vi.mocked(moveArticle).mockReset();
  vi.mocked(updateArticle).mockReset();
});

describe('AdminArticleTreePage drag and drop', () => {
  it('given a row dragged onto the lower quarter of a later sibling, then moves it after that sibling', async () => {
    renderPage();

    const { drop } = drag('Условия', 'Время', 35);
    expect(rowOf('Время').getAttribute('data-drop')).toBe('after');
    drop();

    await waitFor(() => expect(moveArticle).toHaveBeenCalledWith(2, { parentArticleId: 1, index: 1 }));
    expect(rowOf('Время').getAttribute('data-drop')).toBeNull();
  });

  it('given a row dropped on the middle of another section, then makes it the last child there', async () => {
    renderPage();

    drag('Утро', 'Пост', 20).drop();

    await waitFor(() => expect(moveArticle).toHaveBeenCalledWith(5, { parentArticleId: 4, index: null }));
  });

  it('given a section dragged over its own descendant, then takes no drop and asks for no move', () => {
    renderPage();

    const { drop } = drag('Намаз', 'Утро', 20);
    expect(rowOf('Утро').getAttribute('data-drop')).toBeNull();
    drop();

    expect(moveArticle).not.toHaveBeenCalled();
  });

  it('given a refused move, when dropped, then shows the translated error above the tree', async () => {
    vi.mocked(moveArticle).mockRejectedValue(new ApiError(translateApiError('article_move_cycle'), 400, 'article_move_cycle'));
    renderPage();

    drag('Пост', 'Намаз', 5).drop();

    expect((await screen.findByRole('alert')).textContent).toContain('Статью нельзя переместить внутрь неё самой');
  });

  it('given a user who may not move articles, then the rows have no drag handle and no rename', () => {
    canEditAnyArticle.value = false;
    renderPage();

    expect(screen.queryAllByTestId('tree-drag-handle')).toHaveLength(0);
    expect(within(rowOf('Пост')).queryByRole('button', { name: 'Переименовать' })).toBeNull();
    expect(within(rowOf('Пост')).getByRole('button', { name: 'Добавить подраздел' })).toBeTruthy();
  });
});

describe('AdminArticleTreePage rename', () => {
  it('given a new title, when saved, then renames the article keeping its parent', async () => {
    vi.mocked(updateArticle).mockResolvedValue();
    renderPage();

    fireEvent.click(within(rowOf('Время')).getByRole('button', { name: 'Переименовать' }));
    const dialog = screen.getByRole('dialog', { name: 'Переименование' });
    const field = within(dialog).getByLabelText('Название раздела') as HTMLInputElement;
    expect(field.value).toBe('Время');
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toHaveProperty('disabled', true);

    fireEvent.change(field, { target: { value: '  Время намаза ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(updateArticle).toHaveBeenCalledWith(3, { title: 'Время намаза', parentArticleId: 1 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('given a refused rename, then keeps the dialog open with the error', async () => {
    vi.mocked(updateArticle).mockRejectedValue(new ApiError(translateApiError('article_title_required'), 400, 'article_title_required'));
    renderPage();

    fireEvent.click(within(rowOf('Пост')).getByRole('button', { name: 'Переименовать' }));
    const dialog = screen.getByRole('dialog', { name: 'Переименование' });
    fireEvent.change(within(dialog).getByLabelText('Название раздела'), { target: { value: 'Ураза' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Укажите название статьи.');
  });
});

describe('AdminArticleTreePage new child', () => {
  it('given a collapsed section, when a child is created from its row, then creates it there and expands the section', async () => {
    vi.mocked(createArticle).mockResolvedValue({ id: 9 } as ArticleReadDto);
    renderPage();
    fireEvent.click(within(rowOf('Намаз')).getByRole('button', { name: 'Свернуть раздел' }));
    expect(screen.queryByRole('link', { name: 'Условия' })).toBeNull();

    fireEvent.click(within(rowOf('Намаз')).getByRole('button', { name: 'Добавить подраздел' }));
    fireEvent.change(screen.getByLabelText('Название раздела'), { target: { value: 'Сунны' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(createArticle).toHaveBeenCalledWith({ title: 'Сунны', parentArticleId: 1 }));
    expect(await screen.findByRole('link', { name: 'Условия' })).toBeTruthy();
  });
});
