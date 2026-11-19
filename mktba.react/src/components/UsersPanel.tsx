import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { USER_ROLES } from '../auth/roleAccess';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLocale } from '../localization/hooks';
import { getUsers } from '../services/adminService';
import { changeUserRole } from '../services/inviteService';
import type { UserRole } from '../shared/types/ApiTypes';
import { Card } from '../shared/ui/Card';

type UsersPanelProps = {
  onNotice: (kind: 'success' | 'error', message: string) => void;
};

/** Every user with a role select (U-04). The API keeps the last admin an admin. */
export const UsersPanel = ({ onNotice }: UsersPanelProps) => {
  const locale = useLocale();
  const t = locale.adminPage;
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_USERS], queryFn: getUsers });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: UserRole }) => changeUserRole(id, role),
    onSuccess: () => onNotice('success', t.userRoleChanged),
    onError: (error) => onNotice('error', (error as Error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_USERS] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.usersTitle}</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.usersDescription}</p>
      </div>
      <Card className="p-6">
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {(usersQuery.data ?? []).map((user) => (
            <li key={user.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-ink-strong)]">{user.email}</span>
              <select
                aria-label={`${t.inviteRoleLabel}: ${user.email}`}
                value={user.role}
                disabled={roleMutation.isPending}
                onChange={(event) => roleMutation.mutate({ id: user.id, role: event.target.value as UserRole })}
                className="h-9 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
              >
                {USER_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {locale.userRole[value]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
