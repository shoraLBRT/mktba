import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import { createInvite, getInvites, revokeInvite } from '../services/inviteService';
import type { InviteDto } from '../shared/types/ApiTypes';
import { InvitesPanel } from './InvitesPanel';

vi.mock('../services/inviteService', () => ({
  getInvites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

const fetchInvites = vi.mocked(getInvites);
const create = vi.mocked(createInvite);
const revoke = vi.mocked(revokeInvite);

const invite = (overrides: Partial<InviteDto>): InviteDto => ({
  id: 1,
  role: 'Author',
  note: null,
  status: 'Active',
  createdAtUtc: '2026-11-19T08:00:00Z',
  expiresAtUtc: '2026-11-20T08:00:00Z',
  usedAtUtc: null,
  revokedAtUtc: null,
  createdByEmail: 'admin@mktba.ru',
  usedByEmail: null,
  ...overrides,
});

const renderPanel = (onNotice = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <InvitesPanel onNotice={onNotice} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
  return { onNotice };
};

describe('InvitesPanel', () => {
  beforeEach(() => {
    fetchInvites.mockReset();
    create.mockReset();
    revoke.mockReset();
  });

  it('given invites in every status, when rendered, then shows each status and offers revoke only for the active one', async () => {
    fetchInvites.mockResolvedValue([
      invite({ id: 1, status: 'Active', note: 'Для Ахмада' }),
      invite({ id: 2, status: 'Used', role: 'Scholar', usedByEmail: 'scholar@mktba.ru' }),
      invite({ id: 3, status: 'Revoked' }),
      invite({ id: 4, status: 'Expired' }),
    ]);
    renderPanel();

    expect(await screen.findByText('Действует')).toBeTruthy();
    expect(screen.getByText('Использовано')).toBeTruthy();
    expect(screen.getByText('Отозвано')).toBeTruthy();
    expect(screen.getByText('Истекло')).toBeTruthy();
    expect(screen.getByText(/scholar@mktba\.ru/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Отозвать' })).toHaveLength(1);
  });

  it('given a role, lifetime and note, when creating, then sends them and shows the token once', async () => {
    fetchInvites.mockResolvedValue([]);
    create.mockResolvedValue({ id: 9, token: 'ABC123', role: 'Scholar', expiresAtUtc: '2026-11-26T08:00:00Z' });
    const { onNotice } = renderPanel();

    fireEvent.change(await screen.findByLabelText('Роль'), { target: { value: 'Scholar' } });
    fireEvent.change(screen.getByLabelText('Срок действия'), { target: { value: '168' } });
    fireEvent.change(screen.getByLabelText('Пометка (для кого)'), { target: { value: '  Шейх Юсуф ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));

    expect((await screen.findByTestId('invite-token')).textContent).toBe('ABC123');
    expect(create.mock.calls[0][0]).toEqual({ role: 'Scholar', lifetimeHours: 168, note: 'Шейх Юсуф' });
    expect(onNotice).toHaveBeenCalledWith('success', 'Приглашение создано');
  });

  it('given the API refuses the invite, when creating, then reports the error and shows no token', async () => {
    fetchInvites.mockResolvedValue([]);
    create.mockRejectedValue(new Error('Срок действия приглашения — от 1 до 720 часов.'));
    const { onNotice } = renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Создать приглашение' }));

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('error', 'Срок действия приглашения — от 1 до 720 часов.'));
    expect(screen.queryByTestId('invite-token')).toBeNull();
  });

  it('given an active invite, when revoked, then calls the API for that invite', async () => {
    fetchInvites.mockResolvedValue([invite({ id: 5 })]);
    revoke.mockResolvedValue();
    const { onNotice } = renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Отозвать' }));

    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('success', 'Приглашение отозвано'));
    expect(revoke.mock.calls[0][0]).toBe(5);
  });
});
