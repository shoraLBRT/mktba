import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';
import NavigationTree from './NavigationTree';

const node = (id: number, title: string, children: NavigationArticleDto[] = []) =>
  ({ id, title, slug: `a${id}`, status: 'Published', hasContent: true, children }) as unknown as NavigationArticleDto;

const tree = [node(1, 'Намаз', [node(2, 'Условия'), node(3, 'Время')]), node(4, 'Пост')];

const rowOf = (title: string) => screen.getByRole('link', { name: title }).parentElement as HTMLElement;

const renderAdminTree = (onMove = vi.fn(), onChangeParent = vi.fn()) => {
  render(
    <LocalizationProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <NavigationTree navigationTree={tree} showArticleEditActions onMove={onMove} onChangeParent={onChangeParent} />
      </MemoryRouter>
    </LocalizationProvider>,
  );
  return { onMove, onChangeParent };
};

describe('NavigationTree reorder controls', () => {
  it('given the first of two children, when moving it down, then asks for index 1 under its parent', () => {
    const { onMove } = renderAdminTree();

    fireEvent.click(within(rowOf('Условия')).getByRole('button', { name: 'Переместить ниже' }));

    expect(onMove).toHaveBeenCalledWith(2, 1, 1);
  });

  it('given the last root, when moving it up, then asks for index 0 at the top level', () => {
    const { onMove } = renderAdminTree();

    fireEvent.click(within(rowOf('Пост')).getByRole('button', { name: 'Переместить выше' }));

    expect(onMove).toHaveBeenCalledWith(4, null, 0);
  });

  it('given the first and last siblings, when rendered, then up and down are disabled at the ends', () => {
    renderAdminTree();

    expect(within(rowOf('Условия')).getByRole('button', { name: 'Переместить выше' })).toHaveProperty('disabled', true);
    expect(within(rowOf('Время')).getByRole('button', { name: 'Переместить ниже' })).toHaveProperty('disabled', true);
  });

  it('given a child, when choosing another section, then hands over the article and its current parent', () => {
    const { onChangeParent } = renderAdminTree();

    fireEvent.click(within(rowOf('Время')).getByRole('button', { name: 'Переместить в другой раздел' }));

    expect(onChangeParent).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 1);
  });

  it('given a reader tree, when rendered, then shows no reorder controls', () => {
    render(
      <LocalizationProvider>
        <MemoryRouter>
          <NavigationTree navigationTree={tree} />
        </MemoryRouter>
      </LocalizationProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Переместить выше' })).toBeNull();
  });
});
