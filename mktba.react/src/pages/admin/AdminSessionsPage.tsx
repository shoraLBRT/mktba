import React from 'react';
import { SessionsPanel } from '../../components/SessionsPanel';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';

/** `/admin/sessions`: the signed-in user's devices. */
const AdminSessionsPage: React.FC = () => {
  const { notice, showNotice, clearNotice } = useNotice();

  return (
    <div className="space-y-6">
      <NoticeBanner notice={notice} onClose={clearNotice} />
      <SessionsPanel
        onEnded={(message) => showNotice('success', message)}
        onError={(message) => showNotice('error', message)}
      />
    </div>
  );
};

export default AdminSessionsPage;
