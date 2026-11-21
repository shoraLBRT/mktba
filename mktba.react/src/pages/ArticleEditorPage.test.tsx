import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { LocalizationProvider } from '../localization/provider';
import { createArticleContent, getArticleContentById, updateArticleContent } from '../services/Article/articleService';
import { changeArticleStatus, getArticleById } from '../services/adminService';
import type { ArticleContentDto, ArticleReadDto, ArticleRevisionSummaryDto, ArticleSnapshotDto, ArticleStatus, NavigationArticleDto } from '../shared/types/ApiTypes';
import { getSystemSchools } from '../services/schoolService';
import { getArticleRevision, getArticleRevisions, restoreArticleRevision } from '../services/Article/revisionService';
import { localDraftCopyKey, readLocalDraftCopy, writeLocalDraftCopy } from './add-article/localDraftCopy';
import { articleDraftFromDto } from './add-article/articleDraft';
import ArticleEditorPage from './ArticleEditorPage';

vi.mock('../services/Article/articleService', () => ({
  createArticleContent: vi.fn(),
  getArticleContentById: vi.fn(),
  updateArticleContent: vi.fn(),
}));
vi.mock('../services/adminService', () => ({
  changeArticleStatus: vi.fn(),
  deleteArticle: vi.fn(),
  getAiProviderSettings: vi.fn(),
  getArticleById: vi.fn(async () => ({ id: 7, title: 'Намаз', status: 'Draft', allowedTransitions: [] })),
  styleMarkdownWithAi: vi.fn(),
}));
vi.mock('../services/Article/revisionService', () => ({
  getArticleRevision: vi.fn(),
  getArticleRevisions: vi.fn(async () => []),
  restoreArticleRevision: vi.fn(),
}));
vi.mock('../auth/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 1, email: 'author@example.com', role: 'Author' }, role: undefined, can: () => false }),
}));
vi.mock('../services/schoolService', () => ({
  createCustomSchool: vi.fn(),
  deleteCustomSchool: vi.fn(),
  getSchoolsByArticleId: vi.fn(async () => []),
  getSystemSchools: vi.fn(async () => []),
}));

const article: ArticleContentDto = {
  id: 7,
  title: 'Намаз',
  slug: 'namaz',
  locale: 'ru',
  tags: [],
  paragraphs: [{ id: 11, order: 1, opinions: [{ id: 21, content: 'Текст статьи', isDefault: true, schoolIds: [], sources: [] }] }],
};

const renderAt = (url: string, navigationTree: NavigationArticleDto[] = []) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE], navigationTree);

  // A data router, as in the app: the unsaved-edits guard needs one.
  const router = createMemoryRouter(
    [
      { path: '/admin/articles/new', element: <ArticleEditorPage /> },
      { path: '/admin/articles/:articleId/edit', element: <ArticleEditorPage /> },
      { path: '/admin/articles/:articleId/history', element: <p>history-page</p> },
      { path: '/:slug', element: <p>article-page</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <RouterProvider router={router} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
  return router;
};

/** The admin read of article 7: a draft with the given allowed moves. */
const draftArticle = (allowedTransitions: ArticleStatus[]): ArticleReadDto => ({
  id: 7,
  title: 'Намаз',
  slug: 'namaz',
  parentArticleId: null,
  order: 0,
  status: 'Draft',
  allowedTransitions,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-01T09:00:00Z',
  hasContent: true,
});

const titleField = () => screen.getByPlaceholderText('Название статьи...') as HTMLInputElement;
/** A paragraph's rich-text editor; TipTap hangs its instance on the editable element. */
const paragraphText = () => screen.getByRole('textbox', { name: 'Введите текст параграфа...' }) as HTMLElement & { editor: Editor };
const typeInParagraph = (text: string) =>
  act(() => {
    // jsdom does not move the focus into a contenteditable, so the focus event is sent by hand.
    fireEvent.focus(paragraphText());
    paragraphText().editor.chain().focus('end').insertContent(text).run();
  });
/** Leaves the editor for the history page, through the link in the history dialog. */
const openHistoryPage = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'История правок' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Открыть отдельной страницей' }));
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

describe('ArticleEditorPage', () => {
  beforeEach(() => {
    vi.mocked(createArticleContent).mockReset();
    vi.mocked(updateArticleContent).mockReset();
    vi.mocked(getArticleContentById).mockReset();
    vi.mocked(getSystemSchools).mockResolvedValue([]);
    vi.mocked(changeArticleStatus).mockReset();
    vi.mocked(getArticleById).mockResolvedValue(draftArticle([]));
    window.localStorage.clear();
  });

  it('given the create address, when rendered, then the editor is empty and offers nothing that needs a saved article', () => {
    renderAt('/admin/articles/new');

    expect(titleField().value).toBe('');
    expect(screen.queryByText('История правок')).toBeNull();
    expect(screen.queryByLabelText('Комментарий к правке')).toBeNull();
  });

  it('given the create address and no title, when saved, then the save is refused with the reason', () => {
    renderAt('/admin/articles/new');

    save();

    expect(screen.getByText('Укажите заголовок статьи')).toBeTruthy();
    expect(createArticleContent).not.toHaveBeenCalled();
  });

  it('given the edit address, when the article loads, then the editor holds it with its history link and revision comment', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');

    expect(await screen.findByDisplayValue('Намаз')).toBeTruthy();
    expect(paragraphText().textContent).toBe('Текст статьи');
    expect(screen.getByRole('button', { name: 'История правок' })).toBeTruthy();
    expect(screen.getByLabelText('Комментарий к правке')).toBeTruthy();
  });

  it('given an edited article, when saved, then the whole content is sent with the comment and the reader page opens', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });
    fireEvent.change(screen.getByLabelText('Комментарий к правке'), { target: { value: 'Заголовок' } });

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(updateArticleContent).toHaveBeenCalledWith(7, expect.objectContaining({
      id: 7,
      title: 'Намаз путника',
      slug: 'namaz',
      editComment: 'Заголовок',
    }));
  });

  it('given an untouched article, when the history link is followed, then it opens without asking', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    await openHistoryPage();

    expect(await screen.findByText('history-page')).toBeTruthy();
  });

  it('given a text the editor would write differently, when opened and left untouched, then the article is not changed', async () => {
    const opinion = { id: 21, content: 'Обычный _курсив_ и * звёздочка\nс мягким переносом', isDefault: true, schoolIds: [], sources: [] };
    vi.mocked(getArticleContentById).mockResolvedValue({ ...article, paragraphs: [{ id: 11, order: 1, opinions: [opinion] }] });
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');
    expect(paragraphText().textContent).toBe('Обычный курсив и * звёздочка с мягким переносом');

    await openHistoryPage();

    expect(await screen.findByText('history-page')).toBeTruthy();
  });

  it('given a text edited and then undone, when the history link is followed, then it opens without asking', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');
    typeInParagraph(' и ещё');
    act(() => {
      paragraphText().editor.commands.undo();
    });

    await openHistoryPage();

    expect(await screen.findByText('history-page')).toBeTruthy();
  });

  it('given formatted text, when saved, then the opinion is sent as Markdown', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');
    act(() => {
      paragraphText().editor.chain().focus('end').insertContent(' и ').toggleBold().insertContent('жирный').run();
    });

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    const dto = vi.mocked(updateArticleContent).mock.calls[0][1];
    expect(dto.paragraphs[0].opinions[0].content).toBe('Текст статьи и **жирный**');
  });

  it('given unsaved edits, when the history link is followed, then the editor asks and staying keeps the edits', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    await openHistoryPage();
    const dialog = await screen.findByRole('alertdialog', { name: 'Уйти без сохранения?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Остаться' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(titleField().value).toBe('Намаз путника');
    expect(screen.queryByText('history-page')).toBeNull();
  });

  it('given unsaved edits, when the user chooses to leave, then the history page opens', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    await openHistoryPage();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Уйти без сохранения' }));

    expect(await screen.findByText('history-page')).toBeTruthy();
  });

  it('given a new article, when it is saved, then its page opens without asking', async () => {
    vi.mocked(createArticleContent).mockResolvedValue({ ...article, id: 8, slug: 'novaya' });
    renderAt('/admin/articles/new');
    fireEvent.change(titleField(), { target: { value: 'Новая' } });
    typeInParagraph('Текст');

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('given an edit, when typing pauses, then a copy is kept in the browser and the indicator says so', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    expect(await screen.findByText('Все изменения сохранены')).toBeTruthy();

    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    expect(await screen.findByText(/Копия правок сохранена в этом браузере/, undefined, { timeout: 3000 })).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))?.draft.title).toBe('Намаз путника');
  });

  it('given an edit, when the article is saved, then no copy is left behind', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
  });

  it('given a copy left by an earlier visit to an article saved since, when the editor opens, then it is offered with a warning and restored on request', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({ ...article, updatedAt: '2026-11-21T12:00:00Z' });
    writeLocalDraftCopy(localDraftCopyKey(1, 7), {
      savedAt: '2026-11-21T10:00:00Z',
      baseUpdatedAt: '2026-11-20T09:00:00Z',
      draft: { ...articleDraftFromDto(article), title: 'Намаз из копии' },
    });
    renderAt('/admin/articles/7/edit');

    const offer = await screen.findByRole('region', { name: 'Найдены несохранённые правки' });
    expect(within(offer).getByText(/Статья с тех пор была сохранена ещё раз/)).toBeTruthy();
    expect(screen.getByDisplayValue('Намаз')).toBeTruthy();

    fireEvent.click(within(offer).getByRole('button', { name: 'Восстановить' }));

    expect(screen.getByDisplayValue('Намаз из копии')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Найдены несохранённые правки' })).toBeNull();
  });

  it('given an offered copy, when it is discarded, then the article stays as loaded and the copy is gone', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    writeLocalDraftCopy(localDraftCopyKey(1, 7), {
      savedAt: '2026-11-21T10:00:00Z',
      baseUpdatedAt: null,
      draft: { ...articleDraftFromDto(article), title: 'Намаз из копии' },
    });
    renderAt('/admin/articles/7/edit');

    const offer = await screen.findByRole('region', { name: 'Найдены несохранённые правки' });
    expect(within(offer).queryByText(/Статья с тех пор была сохранена ещё раз/)).toBeNull();
    fireEvent.click(within(offer).getByRole('button', { name: 'Отбросить' }));

    expect(screen.getByDisplayValue('Намаз')).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
  });

  it('given unsaved edits, when the user leaves without saving, then their copy is dropped too', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    await openHistoryPage();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Уйти без сохранения' }));

    expect(await screen.findByText('history-page')).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
  });

  it('given a picked article, when the link is inserted, then the title becomes a link to it, selected, and is saved as Markdown', async () => {
    const target: NavigationArticleDto = { id: 9, title: 'Пост', slug: 'post', status: 'Published', hasContent: true, canEdit: true };
    vi.mocked(createArticleContent).mockResolvedValue({ ...article, id: 8, slug: 'novaya' });
    renderAt('/admin/articles/new', [target]);
    fireEvent.change(titleField(), { target: { value: 'Новая' } });
    typeInParagraph('См. ');

    fireEvent.click(screen.getByRole('button', { name: 'Ссылка на статью' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ссылка на статью' })).getByRole('button', { name: /Пост/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    const { editor } = paragraphText();
    expect(within(paragraphText()).getByRole('link', { name: 'Пост' }).getAttribute('href')).toBe('/post');
    expect([editor.state.selection.from, editor.state.selection.to]).toEqual([5, 9]);

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(vi.mocked(createArticleContent).mock.calls[0][0].paragraphs[0].opinions[0].content).toBe('См. [Пост](/post)');
  });

  it('given a selected word, when the external link is applied from the dialog, then the word links to the typed address', () => {
    renderAt('/admin/articles/new');
    typeInParagraph('сайт');
    act(() => {
      paragraphText().editor.commands.setTextSelection({ from: 1, to: 5 });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Внешняя ссылка' }));
    const dialog = screen.getByRole('dialog', { name: 'Внешняя ссылка' });
    fireEvent.change(within(dialog).getByLabelText('Адрес ссылки'), { target: { value: 'https://example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(paragraphText()).getByRole('link', { name: 'сайт' }).getAttribute('href')).toBe('https://example.com');
  });

  it('given a paragraph, when duplicated, then the copy is saved as a new paragraph after it', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    fireEvent.click(screen.getByRole('button', { name: 'Дублировать блок' }));
    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    const dto = vi.mocked(updateArticleContent).mock.calls[0][1];
    expect(dto.paragraphs.map((paragraph) => [paragraph.id, paragraph.opinions[0].id, paragraph.opinions[0].content])).toEqual([
      [11, 21, 'Текст статьи'],
      [0, 0, 'Текст статьи'],
    ]);
  });

  it('given two blocks, when the first is dragged by its handle onto the lower half of the second, then they swap places', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({
      ...article,
      paragraphs: [
        ...article.paragraphs,
        { id: 12, order: 2, opinions: [{ id: 22, content: 'Второй абзац', isDefault: true, schoolIds: [], sources: [] }] },
      ],
    });
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');
    const handle = screen.getByRole('button', { name: /^Блок 1 из 2\./ });
    const second = screen.getByText('Второй абзац').closest('section') as HTMLElement;
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(second, { dataTransfer, clientY: 10 });
    fireEvent.drop(second, { dataTransfer, clientY: 10 });
    fireEvent.dragEnd(handle, { dataTransfer });
    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    const dto = vi.mocked(updateArticleContent).mock.calls[0][1];
    expect(dto.paragraphs.map((paragraph) => paragraph.id)).toEqual([12, 11]);
  });

  it('given a block handle, when the down arrow is pressed on it, then the block moves down and its handle says so', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({
      ...article,
      paragraphs: [
        ...article.paragraphs,
        { id: 12, order: 2, opinions: [{ id: 22, content: 'Второй абзац', isDefault: true, schoolIds: [], sources: [] }] },
      ],
    });
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    fireEvent.keyDown(screen.getByRole('button', { name: /^Блок 1 из 2\./ }), { key: 'ArrowDown' });

    const texts = screen.getAllByRole('textbox', { name: 'Введите текст параграфа...' }).map((node) => node.textContent);
    expect(texts).toEqual(['Второй абзац', 'Текст статьи']);
  });

  it('given a block of opinions whose other opinion has text, when turned into a paragraph, then the editor asks and only the default opinion is kept without schools', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({
      ...article,
      paragraphs: [{
        id: 11,
        order: 1,
        opinions: [
          { id: 21, content: 'Мнение ханафитов', isDefault: true, schoolIds: [1], sources: [] },
          { id: 22, content: 'Мнение шафиитов', isDefault: false, schoolIds: [3], sources: [] },
        ],
      }],
    });
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');
    const convert = () => fireEvent.click(screen.getByRole('button', { name: 'Преобразовать в обычный параграф' }));

    convert();
    const dialog = screen.getByRole('alertdialog', { name: 'Оставить только мнение по умолчанию?' });
    expect(dialog.textContent).toContain('(их число: 1)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Преобразовать в обычный параграф' })).toBeTruthy();

    convert();
    fireEvent.click(screen.getByRole('button', { name: 'Преобразовать' }));
    expect(paragraphText().textContent).toBe('Мнение ханафитов');
    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    const dto = vi.mocked(updateArticleContent).mock.calls[0][1];
    expect(dto.paragraphs).toEqual([
      expect.objectContaining({ id: 11, opinions: [expect.objectContaining({ id: 21, content: 'Мнение ханафитов', isDefault: true, schoolIds: [] })] }),
    ]);
  });

  it('given a plain paragraph, when turned into a block of opinions, then its text is the default opinion and a second empty one is open to write', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    fireEvent.click(screen.getByRole('button', { name: 'Преобразовать в блок мнений' }));

    expect(screen.getByRole('textbox', { name: 'Текст мнения: Общее мнение...' }).textContent).toBe('Текст статьи');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Общее мнение, по умолчанию', 'Без мазхаба']);
  });

  describe('opinion tabs named by school (E-06)', () => {
    const systemSchools = [
      { id: 1, slug: 'hanafi', name: 'Ханафитский мазхаб', shortName: 'Хан', isSystem: true },
      { id: 2, slug: 'maliki', name: 'Маликитский мазхаб', shortName: 'Мал', isSystem: true },
      { id: 3, slug: 'shafii', name: 'Шафиитский мазхаб', shortName: 'Шаф', isSystem: true },
      { id: 4, slug: 'hanbali', name: 'Ханбалитский мазхаб', shortName: 'Ханб', isSystem: true },
    ];
    const blockOfOpinions: ArticleContentDto = {
      ...article,
      paragraphs: [{
        id: 11,
        order: 1,
        opinions: [
          { id: 21, content: 'Мнение ханафитов', isDefault: true, schoolIds: [1], sources: [] },
          { id: 22, content: 'Мнение шафиитов', isDefault: false, schoolIds: [3], sources: [] },
        ],
      }],
    };
    const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

    beforeEach(() => {
      vi.mocked(getSystemSchools).mockResolvedValue(systemSchools);
      vi.mocked(getArticleContentById).mockResolvedValue(blockOfOpinions);
    });

    it('given a block of opinions, when it opens, then each tab names its schools, the default is marked and the uncovered schools are named', async () => {
      renderAt('/admin/articles/7/edit');
      await screen.findByRole('tab', { name: 'Хан, по умолчанию' });

      expect(tabNames()).toEqual(['Хан, по умолчанию', 'Шаф']);
      expect(screen.getByRole('tab', { name: 'Хан, по умолчанию' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByRole('tabpanel', { name: 'Хан, по умолчанию' })).toBeTruthy();
      expect(screen.getByTestId('uncovered-schools').textContent).toBe(
        'Без своего мнения: Маликитский мазхаб, Ханбалитский мазхаб. Их читатели увидят мнение по умолчанию.',
      );
    });

    it('given the tabs, when an arrow key is pressed on one, then the next opinion is selected and focused', async () => {
      renderAt('/admin/articles/7/edit');
      const first = await screen.findByRole('tab', { name: 'Хан, по умолчанию' });

      fireEvent.keyDown(first, { key: 'ArrowRight' });

      const second = screen.getByRole('tab', { name: 'Шаф' });
      expect(second.getAttribute('aria-selected')).toBe('true');
      expect(second.getAttribute('tabindex')).toBe('0');
      expect(document.activeElement).toBe(second);
      expect(screen.getByRole('textbox', { name: 'Текст мнения: Шаф...' }).textContent).toBe('Мнение шафиитов');
    });

    it('given uncovered schools, when one is picked in «+ Мазхаб», then a new opinion for it is selected and the school leaves the hint and the menu', async () => {
      renderAt('/admin/articles/7/edit');
      await screen.findByRole('tab', { name: 'Хан, по умолчанию' });

      fireEvent.click(screen.getByRole('button', { name: 'Добавить мнение для мазхаба' }));
      const menu = screen.getByRole('menu', { name: 'Добавить мнение для мазхаба' });
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Маликитский мазхаб', 'Ханбалитский мазхаб', 'Мнение без мазхаба',
      ]);
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Маликитский мазхаб' }));

      expect(screen.queryByRole('menu')).toBeNull();
      expect(tabNames()).toEqual(['Хан, по умолчанию', 'Шаф', 'Мал']);
      expect(screen.getByRole('tab', { name: 'Мал' }).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByTestId('uncovered-schools').textContent).toContain('Без своего мнения: Ханбалитский мазхаб.');

      fireEvent.click(screen.getByRole('button', { name: 'Добавить мнение для мазхаба' }));
      expect(within(screen.getByRole('menu')).getAllByRole('menuitem', { name: /мазхаб/ }).map((item) => item.textContent)).toEqual([
        'Ханбалитский мазхаб', 'Мнение без мазхаба',
      ]);
      fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Ханбалитский мазхаб' }), { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Добавить мнение для мазхаба' }));
    });

    it('given a school of another opinion, when it is picked on the opinion on screen, then it moves there and the save sends it once', async () => {
      vi.mocked(updateArticleContent).mockResolvedValue();
      renderAt('/admin/articles/7/edit');
      fireEvent.click(await screen.findByRole('tab', { name: 'Шаф' }));

      const chips = screen.getByRole('group', { name: 'Мазхабы мнения «Шаф»' });
      const hanafi = within(chips).getByRole('button', { name: 'Хан' });
      expect(hanafi.getAttribute('aria-pressed')).toBe('false');
      expect(hanafi.getAttribute('title')).toBe('Ханафитский мазхаб: сейчас у мнения «Хан». Нажмите, чтобы перенести сюда');
      fireEvent.click(hanafi);

      expect(tabNames()).toEqual(['Общее мнение, по умолчанию', 'Шаф, Хан']);
      save();
      await waitFor(() => expect(updateArticleContent).toHaveBeenCalled());
      const dto = vi.mocked(updateArticleContent).mock.calls[0][1];
      expect(dto.paragraphs[0].opinions).toEqual([
        expect.objectContaining({ id: 21, isDefault: true, schoolIds: [] }),
        expect.objectContaining({ id: 22, isDefault: false, schoolIds: [3, 1] }),
      ]);
    });
  });

  it('given an empty paragraph, when / is typed and Enter picks the highlighted heading, then the block becomes a heading', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({ ...article, paragraphs: [] });
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    typeInParagraph('/');
    const menu = screen.getByRole('listbox', { name: 'Тип блока' });
    expect(within(menu).getAllByRole('option').map((option) => option.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    act(() => {
      paragraphText().editor.chain().focus('end').insertContent('h2').run();
    });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(paragraphText(), { key: 'Enter' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByPlaceholderText('Заголовок раздела...')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Введите текст параграфа...' })).toBeNull();
  });

  it('given an article with headings, when a heading is picked in the structure, then its block is scrolled to and its text takes the focus', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({
      ...article,
      paragraphs: [
        { id: 11, order: 1, opinions: [{ id: 21, content: '## Условия', isDefault: true, schoolIds: [], sources: [] }] },
        { id: 12, order: 2, opinions: [{ id: 22, content: 'Текст статьи', isDefault: true, schoolIds: [], sources: [] }] },
        { id: 13, order: 3, opinions: [{ id: 23, content: '### Время', isDefault: true, schoolIds: [], sources: [] }] },
      ],
    });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    const outline = screen.getByRole('navigation', { name: 'Структура статьи' });
    expect(within(outline).getAllByRole('button').map((button) => button.textContent)).toEqual(['Условия', 'Время']);
    fireEvent.click(within(outline).getByRole('button', { name: 'Перейти к заголовку «Время»' }));

    const heading = screen.getByDisplayValue('Время');
    expect(document.activeElement).toBe(heading);
    expect(scrollIntoView.mock.contexts.some((element) => (element as Element).contains(heading))).toBe(true);
  });

  it('given the / menu, when Escape is pressed, then it closes and the slash stays as text', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({ ...article, paragraphs: [] });
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    typeInParagraph('/');
    fireEvent.keyDown(paragraphText(), { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(paragraphText().textContent).toBe('/');
  });

  it('given an article that cannot be loaded, when the edit address opens, then the load error is shown', async () => {
    vi.mocked(getArticleContentById).mockRejectedValue(new Error('404'));
    renderAt('/admin/articles/7/edit');

    await waitFor(() => expect(screen.getByText('Не удалось загрузить статью')).toBeTruthy());
  });

  it('given the edit address, when the article loads, then the publication panel shows the status, the address and the search snippet', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');

    const panel = await screen.findByTestId('publication-panel');
    expect(await within(panel).findByText('Черновик')).toBeTruthy();
    expect((within(panel).getByLabelText('Адрес статьи') as HTMLInputElement).value).toBe('namaz');
    const seoSection = within(panel).getByTestId('seo-fields') as HTMLDetailsElement;
    seoSection.open = true;
    fireEvent(seoSection, new Event('toggle'));
    const snippet = within(panel).getByTestId('seo-snippet');
    expect(within(snippet).getByText('Намаз')).toBeTruthy();
    expect(within(snippet).getByText('Текст статьи')).toBeTruthy();
  });

  it('given unsaved edits, when the article is submitted for review, then the edits are saved first and the editor stays open', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    vi.mocked(updateArticleContent).mockResolvedValue();
    vi.mocked(changeArticleStatus).mockResolvedValue({ ...draftArticle(['Draft']), status: 'InReview' });
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });
    fireEvent.change(screen.getByLabelText('Комментарий к правке'), { target: { value: 'Заголовок' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить и отправить на проверку' }));

    await waitFor(() => expect(changeArticleStatus).toHaveBeenCalledWith(7, 'InReview'));
    expect(updateArticleContent).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Намаз путника', editComment: 'Заголовок' }));
    expect(vi.mocked(updateArticleContent).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(changeArticleStatus).mock.invocationCallOrder[0]);
    expect(await screen.findByText('Статус изменён: На проверке')).toBeTruthy();
    expect(screen.queryByText('article-page')).toBeNull();
    expect((screen.getByLabelText('Комментарий к правке') as HTMLInputElement).value).toBe('');
    expect(screen.getByDisplayValue('Намаз путника')).toBeTruthy();
  });

  it('given unsaved edits the save refuses, when the article is submitted, then the status stays and the edits are kept', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: '' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить и отправить на проверку' }));

    expect(await screen.findByText('Укажите заголовок статьи')).toBeTruthy();
    expect(updateArticleContent).not.toHaveBeenCalled();
    expect(changeArticleStatus).not.toHaveBeenCalled();
  });

  it('given a save that fails, when the article is submitted, then the status is not changed', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    vi.mocked(updateArticleContent).mockRejectedValue(new Error('сеть недоступна'));
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить и отправить на проверку' }));

    expect(await screen.findByText(/сеть недоступна/)).toBeTruthy();
    expect(changeArticleStatus).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Намаз путника')).toBeTruthy();
  });

  it('given no edits, when the article is submitted, then only the status moves', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    vi.mocked(changeArticleStatus).mockResolvedValue({ ...draftArticle(['Draft']), status: 'InReview' });
    renderAt('/admin/articles/7/edit');

    fireEvent.click(await screen.findByRole('button', { name: 'Отправить на проверку' }));

    await waitFor(() => expect(changeArticleStatus).toHaveBeenCalledWith(7, 'InReview'));
    expect(updateArticleContent).not.toHaveBeenCalled();
  });

  it('given a clean saved article, when it is submitted, then the checklist has no remarks and nothing asks first', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    vi.mocked(changeArticleStatus).mockResolvedValue({ ...draftArticle(['Draft']), status: 'InReview' });
    renderAt('/admin/articles/7/edit');

    expect(within(await screen.findByTestId('prepublish-checklist')).getByText('Замечаний нет.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Отправить на проверку' }));

    await waitFor(() => expect(changeArticleStatus).toHaveBeenCalledWith(7, 'InReview'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('given a title too long for search, when it is submitted, then the editor asks and «Исправить» keeps the status', async () => {
    const longTitle = 'Очень длинное название статьи о намазе путника, которое не поместится в выдаче';
    vi.mocked(getArticleContentById).mockResolvedValue({ ...article, title: longTitle });
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    renderAt('/admin/articles/7/edit');

    const checklist = await screen.findByTestId('prepublish-checklist');
    expect(within(checklist).getByText(`Заголовок для поиска: ${longTitle.length} из 70 символов`)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Отправить на проверку' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Замечаний: 1. Всё равно продолжить?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Исправить' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(changeArticleStatus).not.toHaveBeenCalled();
  });

  it('given remarks and unsaved edits, when the move is confirmed, then the edits are saved and the status moves', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(getArticleById).mockResolvedValue(draftArticle(['InReview']));
    vi.mocked(updateArticleContent).mockResolvedValue();
    vi.mocked(changeArticleStatus).mockResolvedValue({ ...draftArticle(['Draft']), status: 'InReview' });
    renderAt('/admin/articles/7/edit');
    const longTitle = 'Намаз путника: сокращение и объединение молитв в дороге по всем четырём мазхабам';
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: longTitle } });

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить и отправить на проверку' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Продолжить' }));

    await waitFor(() => expect(changeArticleStatus).toHaveBeenCalledWith(7, 'InReview'));
    expect(updateArticleContent).toHaveBeenCalledWith(7, expect.objectContaining({ title: longTitle }));
  });
  describe('history in the editor (E-13)', () => {
    const revision = (number: number, comment: string | null): ArticleRevisionSummaryDto => ({
      id: number,
      number,
      createdAt: '2026-11-0' + number + 'T09:00:00Z',
      authorDisplayName: number === 2 ? 'Абдуллах' : null,
      authorEmail: number === 2 ? 'author@example.com' : null,
      comment,
      isPublished: false,
    });
    const snapshotOf = (title: string): ArticleSnapshotDto => ({
      schemaVersion: 3,
      title,
      slug: 'namaz',
      tags: [],
      paragraphs: [{ order: 1, opinions: [{ content: 'Текст статьи', isDefault: true, schoolIds: [], sources: [] }] }],
      relatedLinks: [],
    });

    beforeEach(() => {
      vi.mocked(getArticleRevisions).mockResolvedValue([revision(2, 'Заголовок'), revision(1, null)]);
      vi.mocked(getArticleRevision).mockImplementation(async (_id, number) => ({
        revision: revision(number, null),
        snapshot: snapshotOf(number === 2 ? 'Намаз' : 'Старый намаз'),
      }));
      vi.mocked(restoreArticleRevision).mockReset();
    });

    const openHistory = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'История правок' }));
      return screen.findByRole('dialog', { name: 'История правок' });
    };

    it('given unsaved edits, when the history opens, then it lists the revisions and compares the draft with the last one', async () => {
      vi.mocked(getArticleContentById).mockResolvedValue(article);
      renderAt('/admin/articles/7/edit');
      fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

      const dialog = await openHistory();

      const latest = (await within(dialog).findByRole('listitem', { name: 'Ревизия 2' })).textContent;
      expect(latest).toContain('Заголовок');
      expect(latest).toContain('Абдуллах');
      expect(latest).not.toContain('author@example.com');
      const first = within(dialog).getByRole('listitem', { name: 'Ревизия 1' }).textContent;
      expect(first).toContain('Без комментария');
      expect(first).toContain('Автор не указан');
      const title = await within(dialog).findByRole('region', { name: 'Заголовок' });
      expect(within(title).getByText('− Намаз').getAttribute('data-diff')).toBe('removed');
      expect(within(title).getByText('+ Намаз путника').getAttribute('data-diff')).toBe('added');
      expect(within(dialog).queryByRole('region', { name: 'Абзац 1' })).toBeNull();
    });

    it('given two revisions picked, when compared, then the difference between them is shown', async () => {
      vi.mocked(getArticleContentById).mockResolvedValue(article);
      renderAt('/admin/articles/7/edit');
      await screen.findByDisplayValue('Намаз');
      const dialog = await openHistory();

      fireEvent.change(await within(dialog).findByLabelText('Было'), { target: { value: '1' } });
      fireEvent.change(within(dialog).getByLabelText('Стало'), { target: { value: '2' } });

      const title = await within(dialog).findByRole('region', { name: 'Заголовок' });
      expect(within(title).getByText('− Старый намаз')).toBeTruthy();
      expect(within(title).getByText('+ Намаз')).toBeTruthy();
    });

    it('given unsaved edits, when a revision is restored, then the editor warns first and then holds the restored article as saved', async () => {
      vi.mocked(getArticleContentById).mockResolvedValueOnce(article).mockResolvedValue({ ...article, title: 'Старый намаз' });
      vi.mocked(restoreArticleRevision).mockResolvedValue(revision(3, 'Назад'));
      renderAt('/admin/articles/7/edit');
      fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });
      const dialog = await openHistory();
      const row = await within(dialog).findByRole('listitem', { name: 'Ревизия 1' });
      expect(within(dialog).getByRole('listitem', { name: 'Ревизия 2' }).querySelector('button')).toBeNull();

      fireEvent.click(within(row).getByRole('button', { name: 'Откатить к этой ревизии' }));
      expect(within(row).getByText('Несохранённые правки в редакторе пропадут.')).toBeTruthy();
      fireEvent.change(within(row).getByLabelText('Комментарий к откату (необязательно)'), { target: { value: 'Назад' } });
      fireEvent.click(within(row).getByRole('button', { name: 'Подтвердить откат' }));

      expect(await screen.findByText('Статья откачена к ревизии 1; сохранена как ревизия 3')).toBeTruthy();
      expect(restoreArticleRevision).toHaveBeenCalledWith(7, 1, 'Назад');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(titleField().value).toBe('Старый намаз');
      expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
      await openHistoryPage();
      expect(await screen.findByText('history-page')).toBeTruthy();
    });

    it('given a rollback the server refuses, when confirmed, then the error is shown and the edits stay', async () => {
      vi.mocked(getArticleContentById).mockResolvedValue(article);
      vi.mocked(restoreArticleRevision).mockRejectedValue(new Error('Адрес занят'));
      renderAt('/admin/articles/7/edit');
      fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });
      const dialog = await openHistory();
      const row = await within(dialog).findByRole('listitem', { name: 'Ревизия 1' });

      fireEvent.click(within(row).getByRole('button', { name: 'Откатить к этой ревизии' }));
      fireEvent.click(within(row).getByRole('button', { name: 'Подтвердить откат' }));

      expect((await within(dialog).findByRole('alert')).textContent).toBe('Не удалось откатить статью: Адрес занят');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть историю' }));
      expect(titleField().value).toBe('Намаз путника');
    });
  });
});
