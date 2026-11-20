import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { MazhabProvider } from './MazhabProvider';
import { MAZHAB_STORAGE_KEY, useMazhab } from './mazhabContext';

const SYSTEM_SCHOOLS = [
  { id: 1, name: 'Ханафитский мазхаб', shortName: 'Хан', slug: 'hanafi', isSystem: true },
  { id: 3, name: 'Шафиитский мазхаб', shortName: 'Шаф', slug: 'shafii', isSystem: true },
];

const SelectedSchool = () => {
  const { selectedSchoolId, setSelectedSchoolId } = useMazhab();
  const location = useLocation();
  return (
    <>
      <p>{`school:${selectedSchoolId ?? 'none'}`}</p>
      <p>{`url:${location.pathname}${location.search}`}</p>
      <button type="button" onClick={() => setSelectedSchoolId(1)}>choose</button>
    </>
  );
};

const treeAt = (url: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, 'mazhab-link'], SYSTEM_SCHOOLS);
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <MazhabProvider>
          <SelectedSchool />
        </MazhabProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => {
  localStorage.clear();
});

describe('MazhabProvider', () => {
  it('given a saved mazhab, when the server renders, then renders the default without reading storage', () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');

    expect(renderToString(treeAt('/'))).toContain('school:none');
  });

  it('given a saved mazhab, when the server HTML hydrates, then applies it without a hydration mismatch', async () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');
    const tree = treeAt('/salat?mazhab=hanafi');
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, tree, { onRecoverableError: (error) => recoverableErrors.push(error) }),
    );

    expect(container.textContent).toContain('school:1');
    expect(recoverableErrors).toEqual([]);
    act(() => root.unmount());
  });

  it('given a link with a mazhab, when opened, then that mazhab is shown and the saved one is kept', () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '1');

    render(treeAt('/salat?mazhab=shafii'));

    expect(screen.getByText('school:3')).not.toBeNull();
    expect(localStorage.getItem(MAZHAB_STORAGE_KEY)).toBe('1');
  });

  it('given a link with an unknown mazhab, when opened, then the saved mazhab is shown', () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '1');

    render(treeAt('/salat?mazhab=nobody'));

    expect(screen.getByText('school:1')).not.toBeNull();
  });

  it('given a link with a mazhab, when the reader chooses another, then it is saved and the parameter leaves the URL', () => {
    render(treeAt('/salat?mazhab=shafii&utm_source=tg'));

    fireEvent.click(screen.getByRole('button', { name: 'choose' }));

    expect(screen.getByText('school:1')).not.toBeNull();
    expect(screen.getByText('url:/salat?utm_source=tg')).not.toBeNull();
    expect(localStorage.getItem(MAZHAB_STORAGE_KEY)).toBe('1');
  });
});
