import React from 'react';
import { InvitesPanel } from '../../components/InvitesPanel';
import { UsersPanel } from '../../components/UsersPanel';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';

/** `/admin/users`: invitations and the users' roles. */
const AdminUsersPage: React.FC = () => {
  const { notice, showNotice, clearNotice } = useNotice();

  return (
    <div className="space-y-8">
      <NoticeBanner notice={notice} onClose={clearNotice} />
      <InvitesPanel onNotice={showNotice} />
      <UsersPanel onNotice={showNotice} />
    </div>
  );
};

export default AdminUsersPage;
