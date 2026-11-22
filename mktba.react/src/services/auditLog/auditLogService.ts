import { APP_CONSTANTS } from '../../constants/AppConstants';
import apiClient from '../../shared/api-client/ApiClient';
import type { AuditAction, AuditLogPageDto } from '../../shared/types/ApiTypes';

export type AuditLogFilter = {
  action?: AuditAction;
  page: number;
  pageSize: number;
};

/** One page of the audit log (U-09, #135), newest first; admins only. */
export const getAuditLog = async (filter: AuditLogFilter): Promise<AuditLogPageDto> => {
  const response = await apiClient.get<AuditLogPageDto>('/audit-log', {
    params: { action: filter.action, page: filter.page, pageSize: filter.pageSize },
  });
  return response.data;
};

/** React Query key of one page of the audit log. */
export const auditLogQueryKey = (filter: AuditLogFilter) =>
  [APP_CONSTANTS.QUERY_KEYS.ADMIN_AUDIT_LOG, filter] as const;
