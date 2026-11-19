import { useId, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { USER_ROLES } from '../auth/roleAccess';
import { useLocale } from '../localization/hooks';
import { createInvite, getInvites, revokeInvite } from '../services/inviteService';
import type { InviteCreatedDto, InviteStatus, UserRole } from '../shared/types/ApiTypes';
import { cn } from '../shared/lib/cn';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';

const INVITES_QUERY_KEY = 'admin-invites';

const LIFETIME_HOURS = [24, 72, 168, 720] as const;

const STATUS_CLASS: Record<InviteStatus, string> = {
  Active: 'bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]',
  Used: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]',
  Revoked: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-subtle)]',
  Expired: 'bg-[var(--color-surface-muted)] text-[var(--color-ink-subtle)]',
};

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

const selectClass = 'h-9 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

type InvitesPanelProps = {
  onNotice: (kind: 'success' | 'error', message: string) => void;
};

/** Invites with a role (U-04): create one, see each one's status, revoke an unused one. */
export const InvitesPanel = ({ onNotice }: InvitesPanelProps) => {
  const locale = useLocale();
  const t = locale.adminPage;
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<UserRole>('Author');
  const [lifetimeHours, setLifetimeHours] = useState<number>(LIFETIME_HOURS[0]);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<InviteCreatedDto | null>(null);
  const invitesQuery = useQuery({ queryKey: [INVITES_QUERY_KEY], queryFn: getInvites });

  const lifetimeLabels: Record<(typeof LIFETIME_HOURS)[number], string> = {
    24: t.inviteLifetimeDay,
    72: t.inviteLifetimeThreeDays,
    168: t.inviteLifetimeWeek,
    720: t.inviteLifetimeMonth,
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: [INVITES_QUERY_KEY] });

  const createMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: (result) => {
      setCreated(result);
      setNote('');
      onNotice('success', t.inviteCreated);
      void refresh();
    },
    onError: (error) => onNotice('error', (error as Error).message),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      onNotice('success', t.inviteRevoked);
      void refresh();
    },
    onError: (error) => onNotice('error', (error as Error).message),
  });

  const invites = invitesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.invitesTitle}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.invitesDescription}</p>
      </div>
      <Card className="p-6">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({ role, lifetimeHours, note: note.trim() || null });
          }}
        >
          <div>
            <label htmlFor={`${fieldId}-role`} className={labelClass}>
              {t.inviteRoleLabel}
            </label>
            <select id={`${fieldId}-role`} value={role} onChange={(event) => setRole(event.target.value as UserRole)} className={selectClass}>
              {USER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {locale.userRole[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${fieldId}-lifetime`} className={labelClass}>
              {t.inviteLifetimeLabel}
            </label>
            <select
              id={`${fieldId}-lifetime`}
              value={lifetimeHours}
              onChange={(event) => setLifetimeHours(Number(event.target.value))}
              className={selectClass}
            >
              {LIFETIME_HOURS.map((hours) => (
                <option key={hours} value={hours}>
                  {lifetimeLabels[hours]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${fieldId}-note`} className={labelClass}>
              {t.inviteNoteLabel}
            </label>
            <Input
              id={`${fieldId}-note`}
              value={note}
              maxLength={200}
              placeholder={t.inviteNotePlaceholder}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={createMutation.isPending}>
            <KeyRound size={14} />
            {createMutation.isPending ? '...' : t.inviteCreate}
          </Button>
        </form>

        {created ? (
          <div className="mt-6 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">
              {t.inviteTokenValueLabel} · {locale.userRole[created.role]}
            </p>
            <code data-testid="invite-token" className="mb-2 block break-all text-sm text-[var(--color-ink-strong)]">
              {created.token}
            </code>
            <p className="mb-3 text-xs text-[var(--color-ink-muted)]">{t.inviteTokenOnce}</p>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(created.token);
                onNotice('success', t.inviteTokenCopied);
              }}
            >
              <Copy size={14} />
              {locale.common.copy}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="p-6">
        {invitesQuery.isSuccess && invites.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">{t.invitesEmpty}</p>
        ) : null}
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-start gap-3 py-3" data-testid="invite-row">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-ink-strong)]">
                  {locale.userRole[invite.role]}
                  <span className={cn('ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold', STATUS_CLASS[invite.status])}>
                    {locale.inviteStatus[invite.status]}
                  </span>
                  {invite.note ? <span className="ml-2 font-normal text-[var(--color-ink-muted)]">{invite.note}</span> : null}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {t.inviteCreatedBy}: {invite.createdByEmail} · {t.inviteExpires}: {dateTime.format(new Date(invite.expiresAtUtc))}
                  {invite.usedByEmail ? ` · ${t.inviteUsedBy}: ${invite.usedByEmail}` : ''}
                </p>
              </div>
              {invite.status === 'Active' ? (
                <Button variant="secondary" onClick={() => revokeMutation.mutate(invite.id)} disabled={revokeMutation.isPending}>
                  {t.inviteRevoke}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
