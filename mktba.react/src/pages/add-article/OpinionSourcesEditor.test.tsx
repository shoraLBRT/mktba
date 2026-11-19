import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { createSource, searchSources } from '../../services/sourceService';
import { ApiError } from '../../shared/api-client/apiError';
import type { SourceDto } from '../../shared/types/ApiTypes';
import { createCitation } from './draftHelpers';
import { OpinionSourcesEditor } from './OpinionSourcesEditor';
import type { CitationDraft } from './types';

vi.mock('../../services/sourceService', () => ({ searchSources: vi.fn(), createSource: vi.fn() }));

const bukhari: SourceDto = { id: 1, kind: 'HadithCollection', title: 'Сахих', author: 'аль-Бухари' };
const quran: SourceDto = { id: 2, kind: 'Quran', title: 'Коран' };

const onSaved = vi.fn<(citations: CitationDraft[]) => void>();

const Harness = ({ initial }: { initial: CitationDraft[] }) => {
  const [citations, setCitations] = useState(initial);
  return (
    <OpinionSourcesEditor
      citations={citations}
      disabled={false}
      onChange={(next) => {
        onSaved(next);
        setCitations(next);
      }}
    />
  );
};

const renderEditor = (initial: CitationDraft[] = []) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <Harness initial={initial} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );

/** What the last change handed to the editor page. */
const saved = () => (onSaved.mock.lastCall?.[0] ?? []).map(({ source, locator }) => ({ sourceId: source.id, locator }));

describe('OpinionSourcesEditor', () => {
  beforeEach(() => {
    vi.mocked(searchSources).mockReset().mockResolvedValue([bukhari, quran]);
    vi.mocked(createSource).mockReset();
    onSaved.mockReset();
  });

  it('given the directory, when a found source is picked and its locator typed, then it is attached with that locator', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Источник' }));
    fireEvent.change(screen.getByLabelText('Поиск в справочнике источников'), { target: { value: 'сахих' } });
    const results = await screen.findByRole('list', { name: 'Найденные источники' });
    fireEvent.click(within(results).getByRole('button', { name: /аль-Бухари\. Сахих/ }));
    fireEvent.change(screen.getByLabelText('Место в источнике «Сахих»'), { target: { value: '№ 1' } });

    expect(saved()).toEqual([{ sourceId: 1, locator: '№ 1' }]);
    await waitFor(() => expect(searchSources).toHaveBeenCalledWith('сахих'));
  });

  it('given attached sources, when one is removed, then the others keep their order and locators', () => {
    renderEditor([createCitation(quran, '2:255'), createCitation(bukhari, '№ 1')]);

    fireEvent.click(screen.getByRole('button', { name: 'Убрать источник «Коран»' }));

    expect(saved()).toEqual([{ sourceId: 1, locator: '№ 1' }]);
    expect(within(screen.getByRole('list', { name: 'Источники' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('given a new source, when it is added to the directory, then it is attached at once', async () => {
    const created: SourceDto = { id: 7, kind: 'Book', title: 'Аль-Умм', author: 'аш-Шафии' };
    vi.mocked(createSource).mockResolvedValue(created);
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Источник' }));
    fireEvent.click(screen.getByRole('button', { name: 'Новый источник' }));
    fireEvent.change(screen.getByLabelText('Вид источника'), { target: { value: 'Book' } });
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Аль-Умм' } });
    fireEvent.change(screen.getByLabelText('Автор'), { target: { value: 'аш-Шафии' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в справочник' }));

    await waitFor(() => expect(saved()).toEqual([{ sourceId: 7, locator: '' }]));
    expect(vi.mocked(createSource).mock.calls[0][0]).toEqual({ kind: 'Book', title: 'Аль-Умм', author: 'аш-Шафии', details: '', url: '' });
    expect(screen.queryByTestId('source-create-form')).toBeNull();
  });

  it('given the directory refuses a new source, when submitted, then its message is shown and nothing is attached', async () => {
    vi.mocked(createSource).mockRejectedValue(new ApiError('Такой источник уже есть в справочнике — найдите его поиском.', 400, 'source_duplicate'));
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Источник' }));
    fireEvent.click(screen.getByRole('button', { name: 'Новый источник' }));
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Сахих' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в справочник' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Такой источник уже есть в справочнике — найдите его поиском.');
    expect(saved()).toEqual([]);
  });
});
