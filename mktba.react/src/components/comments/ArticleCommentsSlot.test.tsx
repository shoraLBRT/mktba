import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleComments } from '../../services/commentService';
import { ArticleCommentsSlot } from './ArticleCommentsSlot';

vi.mock('../../services/commentService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/commentService')>()),
  getArticleComments: vi.fn(),
}));

const tree = () => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LocalizationProvider>
      <MemoryRouter>
        <ArticleCommentsSlot articleId={12} />
      </MemoryRouter>
    </LocalizationProvider>
  </QueryClientProvider>
);

afterEach(() => {
  cleanup();
  vi.mocked(getArticleComments).mockReset();
});

describe('ArticleCommentsSlot', () => {
  it('puts only the heading and the button into the server HTML: no comment text, no link', () => {
    const html = renderToString(tree());

    expect(html).toContain('Комментарии');
    expect(html).toContain('Показать комментарии');
    expect(html).not.toContain('<a ');
    expect(getArticleComments).not.toHaveBeenCalled();
  });

  it('loads the comments when the reader asks for them', async () => {
    vi.mocked(getArticleComments).mockResolvedValue({
      items: [{ id: 1, parentId: null, authorName: 'Аиша', body: 'Спасибо', isDeleted: false, isMine: false, canEdit: false, canDelete: false, createdAt: '2026-11-26T10:00:00Z', editedAt: null }],
      total: 1,
      threads: 1,
      page: 1,
      pageSize: 20,
      viewer: { canComment: false, block: 'SignInRequired' },
    });

    render(tree());
    expect(getArticleComments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Показать комментарии' }));

    // The chunk is imported for real here: give it time when the whole suite runs at once.
    expect(await screen.findByText('Спасибо', {}, { timeout: 10_000 })).toBeTruthy();
    expect(getArticleComments).toHaveBeenCalledWith(12, 1);
  });
});
