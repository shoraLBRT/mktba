import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { changeArticleStatus, getArticleById } from '../../services/adminService';
import { ApiError } from '../../shared/api-client/apiError';
import type { ArticleReadDto } from '../../shared/types/ApiTypes';
import { ArticleStatusPanel } from './ArticleStatusPanel';

vi.mock('../../services/adminService', () => ({
  getArticleById: vi.fn(),
  changeArticleStatus: vi.fn(),
}));

const fetchArticle = vi.mocked(getArticleById);
const changeStatus = vi.mocked(changeArticleStatus);

const article = (overrides: Partial<ArticleReadDto>): ArticleReadDto => ({
  id: 7,
  title: 'Намаз',
  slug: 'namaz',
  parentArticleId: null,
  status: 'Draft',
  allowedTransitions: ['InReview'],
  hasContent: true,
  ...overrides,
});

const renderPanel = (onChanged = vi.fn(), onError = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <ArticleStatusPanel articleId={7} onChanged={onChanged} onError={onError} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
  return { onChanged, onError };
};

describe('ArticleStatusPanel', () => {
  beforeEach(() => {
    fetchArticle.mockReset();
    changeStatus.mockReset();
  });

  it('given an article in review, when rendered, then shows its status and one button per allowed move', async () => {
    fetchArticle.mockResolvedValue(article({ status: 'InReview', allowedTransitions: ['Published', 'Draft'] }));

    renderPanel();

    expect(await screen.findByText('На проверке')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Вернуть в черновики' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Убрать в архив' })).toBeNull();
  });

  it('given a draft, when submitting for review, then calls the API and reports the new status', async () => {
    fetchArticle.mockResolvedValue(article({}));
    changeStatus.mockResolvedValue(article({ status: 'InReview', allowedTransitions: ['Published', 'Draft'] }));
    const { onChanged } = renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Отправить на проверку' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('InReview'));
    expect(changeStatus).toHaveBeenCalledWith(7, 'InReview');
  });

  it('given the API rejects the move, when clicking, then reports the error', async () => {
    fetchArticle.mockResolvedValue(article({}));
    changeStatus.mockRejectedValue(new ApiError('Статью нельзя перевести в этот статус из текущего.', 400));
    const { onChanged, onError } = renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Отправить на проверку' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('Статью нельзя перевести')));
    expect(onChanged).not.toHaveBeenCalled();
  });
});
