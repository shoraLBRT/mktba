import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../localization/hooks';
import { endSession, getSessions, logOutEverywhere } from '../services/authService';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';

const SESSIONS_QUERY_KEY = 'auth-sessions';

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

type SessionsPanelProps = {
  onError: (message: string) => void;
  onEnded: (message: string) => void;
};

/** The signed-in user's devices (U-03): end one, or sign out everywhere. */
export const SessionsPanel = ({ onError, onEnded }: SessionsPanelProps) => {
  const t = useLocale().adminPage;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessionsQuery = useQuery({ queryKey: [SESSIONS_QUERY_KEY], queryFn: getSessions });

  const endMutation = useMutation({
    mutationFn: endSession,
    onSuccess: () => {
      onEnded(t.sessionsEnded);
      void queryClient.invalidateQueries({ queryKey: [SESSIONS_QUERY_KEY] });
    },
    onError: (error) => onError((error as Error).message),
  });

  const logOutAllMutation = useMutation({
    mutationFn: logOutEverywhere,
    onSuccess: () => navigate('/admin/login', { replace: true }),
    onError: (error) => onError((error as Error).message),
  });

  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.sessionsTitle}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.sessionsDescription}</p>
      </div>
      <Card className="p-6">
        {sessionsQuery.isSuccess && sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">{t.sessionsEmpty}</p>
        ) : null}
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-start gap-3 py-3">
              <MonitorSmartphone size={18} className="mt-0.5 flex-shrink-0 text-[var(--color-ink-subtle)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--color-ink-strong)]" title={session.userAgent ?? undefined}>
                  {session.userAgent || t.sessionsUnknownDevice}
                  {session.isCurrent ? (
                    <span className="ml-2 rounded bg-[var(--color-brand-forest-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-brand-forest)]">
                      {t.sessionsCurrent}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {t.sessionsStarted}: {dateTime.format(new Date(session.startedAtUtc))} · {t.sessionsLastActive}:{' '}
                  {dateTime.format(new Date(session.lastActiveAtUtc))}
                  {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                </p>
              </div>
              {session.isCurrent ? null : (
                <Button
                  variant="secondary"
                  onClick={() => endMutation.mutate(session.id)}
                  disabled={endMutation.isPending}
                >
                  {t.sessionsEnd}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-6">
        <p className="mb-4 text-sm text-[var(--color-ink-muted)]">{t.sessionsLogoutAllHint}</p>
        <Button variant="danger" onClick={() => logOutAllMutation.mutate()} disabled={logOutAllMutation.isPending}>
          <LogOut size={14} />
          {t.sessionsLogoutAll}
        </Button>
      </Card>
    </div>
  );
};
