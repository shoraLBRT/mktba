import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { MazhabProvider } from './MazhabProvider';
import { MAZHAB_STORAGE_KEY, useMazhab } from './mazhabContext';

const SelectedSchool = () => <p>{`school:${useMazhab().selectedSchoolId ?? 'none'}`}</p>;

const tree = (
  <MazhabProvider>
    <SelectedSchool />
  </MazhabProvider>
);

afterEach(() => {
  localStorage.clear();
});

describe('MazhabProvider', () => {
  it('given a saved mazhab, when the server renders, then renders the default without reading storage', () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');

    expect(renderToString(tree)).toContain('school:none');
  });

  it('given a saved mazhab, when the server HTML hydrates, then applies it without a hydration mismatch', async () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, tree, { onRecoverableError: (error) => recoverableErrors.push(error) }),
    );

    expect(container.textContent).toBe('school:3');
    expect(recoverableErrors).toEqual([]);
    act(() => root.unmount());
  });
});
