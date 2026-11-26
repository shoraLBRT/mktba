import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { downloadScholarDocument } from '../../services/scholarApplicationService';
import {
  decideScholarApplication,
  getScholarApplicationReview,
  scholarApplicationReviewQueryKey,
  type ScholarDecision,
} from '../../services/scholarReviewService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { saveBlob } from '../../shared/saveBlob';
import { SCHOLAR_DECISION_REASON_MAX_LENGTH, applicantLabel, type ScholarMazhab } from '../../shared/scholarApplication';
import type { ScholarApplicationReviewDto, ScholarDocumentDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Textarea } from '../../shared/ui/Textarea';

type Pending = 'approve' | 'reject' | 'revoke' | null;

/**
 * `/admin/scholar-applications/:applicationId` (V-02, #118): one scholar application for the admin —
 * the applicant and their current role, what they wrote, the documents (downloaded with the session's
 * token), the reason of an earlier refusal or revocation, and the decisions still open: approve
 * (after a confirmation), reject or revoke the scholar status (each with a required reason).
 */
const AdminScholarReviewDetailPage = () => {
  const { applicationId } = useParams();
  const id = Number(applicationId);
  const locale = useLocale();
  const t = locale.scholarReview;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const reviewQuery = useQuery({
    queryKey: scholarApplicationReviewQueryKey(id),
    queryFn: () => getScholarApplicationReview(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const onDecided = (next: ScholarApplicationReviewDto, message: string) => {
    queryClient.setQueryData(scholarApplicationReviewQueryKey(id), next);
    void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.SCHOLAR_APPLICATIONS] });
    showNotice('success', message);
  };

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />
      <Link to="/admin/scholar-applications" className="text-sm text-[var(--color-brand-forest)] hover:underline">{t.back}</Link>
      <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{formatMessage(t.detailTitle, { id: applicationId ?? '' })}</h1>
      {reviewQuery.isError ? (
        <Card role="alert" className="p-6 text-sm text-red-700">{`${t.detailLoadError}: ${extractApiErrorMessage(reviewQuery.error)}`}</Card>
      ) : reviewQuery.data ? (
        <ReviewCard
          review={reviewQuery.data}
          onDecided={onDecided}
          onError={(message) => showNotice('error', message)}
        />
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
      )}
    </div>
  );
};

const ReviewCard = ({
  review,
  onDecided,
  onError,
}: {
  review: ScholarApplicationReviewDto;
  onDecided: (next: ScholarApplicationReviewDto, message: string) => void;
  onError: (message: string) => void;
}) => {
  const locale = useLocale();
  const t = locale.scholarReview;
  const applicationText = locale.scholarApplication;
  const format = useFormat();
  const { application, applicant } = review;
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [reasonMissing, setReasonMissing] = useState(false);
  const decision = useMutation({
    mutationFn: (next: ScholarDecision) => decideScholarApplication(application.id, next),
    onSuccess: (next, variables) => {
      setPending(null);
      setReason('');
      onDecided(next, variables.kind === 'approve' ? t.approved : variables.kind === 'reject' ? t.rejected : t.revoked);
    },
    onError: (error) => onError(`${t.decisionFailed}: ${extractApiErrorMessage(error)}`),
  });
  const download = async (document: ScholarDocumentDto) => {
    try {
      saveBlob(await downloadScholarDocument(document.id), document.fileName);
    } catch (error) {
      onError(`${applicationText.downloadFailed}: ${extractApiErrorMessage(error)}`);
    }
  };
  const mazhab = application.mazhab
    ? applicationText.mazhabs[application.mazhab as ScholarMazhab] ?? application.mazhab
    : applicationText.mazhabNone;
  const roleChanged =
    (application.status === 'Pending' && !review.canApprove) || (application.status === 'Approved' && !review.canRevoke);
  const open = (next: Pending) => {
    setPending(next);
    setReason('');
    setReasonMissing(false);
  };
  const submitReason = (kind: 'reject' | 'revoke') => {
    if (!reason.trim()) {
      setReasonMissing(true);
      return;
    }

    decision.mutate({ kind, reason: reason.trim() });
  };

  const rows: (readonly [string, string])[] = [
    [t.applicant, applicantLabel(applicant)],
    [t.currentRole, locale.userRole[applicant.role]],
    [applicationText.degree, application.degree],
    [applicationText.institution, application.institution],
    [applicationText.specialization, application.specialization],
    [applicationText.mazhab, mazhab],
    [applicationText.submittedAt, format.date(application.submittedAt, 'dateTime')],
    ...(application.closedAt ? [[applicationText.closedAt, format.date(application.closedAt, 'dateTime')] as const] : []),
    ...(application.revokedAt ? [[applicationText.revokedAt, format.date(application.revokedAt, 'dateTime')] as const] : []),
  ];

  return (
    <Card className="space-y-4 p-6" data-testid="scholar-review-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-ink-strong)]">{applicantLabel(applicant)}</h2>
        <span data-testid="scholar-review-status" className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-sm font-medium text-[var(--color-ink-default)]">
          {applicationText.status[application.status]}
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</dt>
            <dd className="mt-1 break-words text-[var(--color-ink-default)]">{value}</dd>
          </div>
        ))}
      </dl>
      {application.decisionReason ? (
        <div className="rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{t.decisionReason}</p>
          <p className="mt-1 whitespace-pre-line break-words text-[var(--color-ink-default)]">{application.decisionReason}</p>
        </div>
      ) : null}
      {application.documents.length > 0 ? (
        <ul aria-label={applicationText.documentsListLabel} className="space-y-2">
          {application.documents.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border-soft)] px-3 py-2 text-sm">
              <span className="min-w-0 break-all text-[var(--color-ink-default)]">{document.fileName}</span>
              <Button variant="ghost" aria-label={formatMessage(applicationText.download, { name: document.fileName })} onClick={() => void download(document)}>
                <Download size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">{t.noDocuments}</p>
      )}
      {roleChanged ? <p className="text-sm text-[var(--color-ink-muted)]" data-testid="scholar-review-role-changed">{t.roleChangedNote}</p> : null}

      {pending === 'approve' ? (
        <div role="group" aria-label={t.approve} className="space-y-3 rounded-lg bg-[var(--color-surface-muted)] p-4">
          <p className="text-sm text-[var(--color-ink-default)]">{t.approveConfirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={decision.isPending} onClick={() => decision.mutate({ kind: 'approve' })}>
              {decision.isPending ? t.approving : t.approveConfirmYes}
            </Button>
            <Button onClick={() => open(null)}>{t.cancel}</Button>
          </div>
        </div>
      ) : pending === 'reject' || pending === 'revoke' ? (
        <div role="group" aria-label={pending === 'reject' ? t.rejectTitle : t.revokeTitle} className="space-y-3 rounded-lg bg-[var(--color-surface-muted)] p-4">
          <p className="text-sm text-[var(--color-ink-default)]">{pending === 'reject' ? t.rejectNote : t.revokeNote}</p>
          <div>
            <label htmlFor="scholar-decision-reason" className="mb-2 block text-sm font-medium text-[var(--color-ink-default)]">{t.reasonLabel}</label>
            <Textarea
              id="scholar-decision-reason"
              value={reason}
              maxLength={SCHOLAR_DECISION_REASON_MAX_LENGTH}
              rows={4}
              aria-invalid={reasonMissing || undefined}
              aria-describedby="scholar-decision-reason-hint"
              onChange={(event) => {
                setReason(event.target.value);
                setReasonMissing(false);
              }}
            />
            <p id="scholar-decision-reason-hint" className={`mt-1 text-xs ${reasonMissing ? 'text-red-700' : 'text-[var(--color-ink-muted)]'}`}>
              {reasonMissing ? t.reasonRequired : formatMessage(t.reasonHint, { max: SCHOLAR_DECISION_REASON_MAX_LENGTH })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={decision.isPending} onClick={() => submitReason(pending)}>
              {decision.isPending ? (pending === 'reject' ? t.rejecting : t.revoking) : t.confirm}
            </Button>
            <Button onClick={() => open(null)}>{t.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {review.canApprove ? <Button variant="primary" onClick={() => open('approve')}>{t.approve}</Button> : null}
          {review.canReject ? <Button variant="danger" onClick={() => open('reject')}>{t.reject}</Button> : null}
          {review.canRevoke ? <Button variant="danger" onClick={() => open('revoke')}>{t.revoke}</Button> : null}
        </div>
      )}
    </Card>
  );
};

export default AdminScholarReviewDetailPage;
