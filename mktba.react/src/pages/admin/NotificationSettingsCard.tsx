import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { getNotificationSettings, updateNotificationSettings } from '../../services/notificationService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { NotificationSettingsWriteDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

const CATEGORIES = ['emailScholarApplication', 'emailArticleReviews', 'emailRemarks'] as const;

/**
 * «Уведомления по почте» on `/admin/profile` (V-09, #125; P-05, #93): which categories of
 * notifications also come by email. In-app notifications are always on; all three are on until changed.
 */
export const NotificationSettingsCard: React.FC = () => {
  const t = useLocale().notifications.settings;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const [draft, setDraft] = useState<NotificationSettingsWriteDto | null>(null);
  const settingsQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.NOTIFICATION_SETTINGS], queryFn: getNotificationSettings });
  const saved = settingsQuery.data;
  const current = draft ?? saved;
  const save = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData([APP_CONSTANTS.QUERY_KEYS.NOTIFICATION_SETTINGS], settings);
      setDraft(null);
      showNotice('success', t.saved);
    },
    onError: (error) => showNotice('error', `${t.saveFailed}: ${extractApiErrorMessage(error)}`),
  });
  const labels: Record<(typeof CATEGORIES)[number], string> = {
    emailScholarApplication: t.scholarApplication,
    emailArticleReviews: t.articleReviews,
    emailRemarks: t.remarks,
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.hint}</p>
      <div className="mt-3">
        <NoticeBanner notice={notice} onClose={clearNotice} />
      </div>
      {settingsQuery.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">{`${t.loadError}: ${extractApiErrorMessage(settingsQuery.error)}`}</p>
      ) : current ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              emailScholarApplication: current.emailScholarApplication,
              emailArticleReviews: current.emailArticleReviews,
              emailRemarks: current.emailRemarks,
            });
          }}
        >
          {saved && !saved.emailsSent ? <p className="text-sm text-[var(--color-ink-muted)]">{t.emailsOff}</p> : null}
          {CATEGORIES.map((key) => (
            <label key={key} className="flex items-start gap-2 text-sm text-[var(--color-ink-default)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={current[key]}
                onChange={(event) => setDraft({ ...current, [key]: event.target.checked })}
              />
              <span>{labels[key]}</span>
            </label>
          ))}
          <Button type="submit" variant="primary" disabled={save.isPending || draft === null}>
            {save.isPending ? t.saving : t.save}
          </Button>
        </form>
      ) : null}
    </Card>
  );
};
