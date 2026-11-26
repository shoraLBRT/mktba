import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roleAllows } from '../auth/roleAccess';
import { useCurrentUser } from '../auth/useCurrentUser';
import { LocalizationProvider } from '../localization/provider';
import { useSession } from '../services/session';
import type { UserRole } from '../shared/types/ApiTypes';
import MainLayout from './MainLayout';

vi.mock('../auth/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));
vi.mock('../services/session', () => ({ useSession: vi.fn(), logOut: vi.fn() }));
vi.mock('../components/Sidebar', () => ({ default: () => <nav data-testid="sidebar" /> }));
vi.mock('../components/mazhab/MazhabSelector', () => ({ MazhabSelector: () => null }));
vi.mock('../components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

const signedOut = () => {
  vi.mocked(useSession).mockReturnValue({ accessToken: null, email: null } as ReturnType<typeof useSession>);
  vi.mocked(useCurrentUser).mockReturnValue({ user: undefined, role: undefined, can: () => false });
};

/** Signed in; `role` undefined means `/auth/me` has not answered yet. */
const signedInAs = (role: UserRole | undefined) => {
  vi.mocked(useSession).mockReturnValue({ accessToken: 'token', email: 'user@example.com' } as ReturnType<typeof useSession>);
  vi.mocked(useCurrentUser).mockReturnValue({ user: undefined, role, can: (policy) => roleAllows(role, policy) });
};

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <LocalizationProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<p>page</p>} />
          </Route>
        </Routes>
      </LocalizationProvider>
    </MemoryRouter>,
  );

const addArticle = () => screen.queryByRole('button', { name: 'Добавить статью' });
const logout = () => screen.queryByRole('button', { name: 'Выйти' });

afterEach(cleanup);

describe('MainLayout header', () => {
  it.each<UserRole>(['Author', 'Admin'])('given a signed-in %s, when shown, then offers to add an article (#322)', (role) => {
    signedInAs(role);
    renderLayout();

    expect(addArticle()).toBeTruthy();
    expect(logout()).toBeTruthy();
  });

  it.each<UserRole>(['Reader', 'Scholar'])('given a signed-in %s, when shown, then hides "add article" but keeps log out (#322)', (role) => {
    signedInAs(role);
    renderLayout();

    expect(addArticle()).toBeNull();
    expect(logout()).toBeTruthy();
  });

  it('given a session whose role has not loaded yet, when shown, then hides "add article" so it never flashes (#322)', () => {
    signedInAs(undefined);
    renderLayout();

    expect(addArticle()).toBeNull();
  });

  it('given no session, when shown, then has neither button and offers to sign in', () => {
    signedOut();
    renderLayout();

    expect(addArticle()).toBeNull();
    expect(logout()).toBeNull();
    expect(screen.getByRole('link', { name: 'Войти' })).toBeTruthy();
  });
});
