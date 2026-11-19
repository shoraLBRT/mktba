import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cleanupDemoData } from '../../services/adminService';
import { invalidateArticleQueries } from '../../app/queryClient';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';

/** `/admin/maintenance`: the danger zone that deletes every article after a typed confirmation phrase. */
const AdminMaintenancePage: React.FC = () => {
  const locale = useLocale();
  const t = locale.adminPage;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [cleanupConfirmation, setCleanupConfirmation] = useState('');
  const confirmationPhrase = t.cleanupConfirmationPhrase;

  const cleanupMutation = useMutation({
    mutationFn: cleanupDemoData,
    onSuccess: async (result) => {
      showNotice(
        'success',
        formatMessage(t.cleanupDone, {
          articles: result.deletedArticles,
          paragraphs: result.deletedParagraphs,
        }),
      );
      setCleanupConfirmation('');
      setIsCleanupModalOpen(false);
      await invalidateArticleQueries(queryClient);
    },
    onError: (error) => showNotice('error', `${t.cleanupFailed}: ${(error as Error).message}`),
  });

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-red-700">{t.maintenanceTitle}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">This action is permanent and cannot be undone.</p>
      </div>
      <Card className="border-red-200 bg-red-50 p-6">
        <div className="mb-4 rounded-lg bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-red-600">Warning</p>
          <p className="mt-2 text-sm text-red-900">{t.maintenanceDescription}</p>
        </div>

        <Button onClick={() => setIsCleanupModalOpen(true)} className="bg-red-600 hover:bg-red-700">
          <Trash2 size={14} />
          {t.deleteAll}
        </Button>
      </Card>

      {isCleanupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl">
            <div className="border-b border-[var(--color-border-soft)] px-6 py-5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-500">{t.cleanupDangerZone}</p>
              <h2 className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.cleanupModalTitle}</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="m-0 text-sm leading-7 text-[var(--color-ink-muted)]">
                {formatMessage(t.cleanupModalHint, { phrase: confirmationPhrase })}
              </p>
              <Input
                value={cleanupConfirmation}
                onChange={(event) => setCleanupConfirmation(event.target.value)}
                placeholder={confirmationPhrase}
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--color-border-soft)] px-6 py-4">
              <Button variant="ghost" onClick={() => setIsCleanupModalOpen(false)}>
                {locale.common.cancel}
              </Button>
              <Button
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupConfirmation !== confirmationPhrase || cleanupMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {cleanupMutation.isPending ? '...' : t.cleanupModalOk}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export default AdminMaintenancePage;
