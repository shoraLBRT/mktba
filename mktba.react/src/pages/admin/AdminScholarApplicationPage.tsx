import React, { useRef, useState, type ReactNode } from 'react';
import { Download, FilePlus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import {
  downloadScholarDocument,
  getMyScholarApplication,
  submitScholarApplication,
  withdrawScholarApplication,
} from '../../services/scholarApplicationService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import {
  EMPTY_SCHOLAR_APPLICATION,
  SCHOLAR_DEGREE_MAX_LENGTH,
  SCHOLAR_DOCUMENT_ACCEPT,
  SCHOLAR_INSTITUTION_MAX_LENGTH,
  SCHOLAR_MAX_DOCUMENTS,
  SCHOLAR_MAZHABS,
  SCHOLAR_SPECIALIZATION_MAX_LENGTH,
  findScholarApplicationProblem,
  type ScholarApplicationDraft,
  type ScholarMazhab,
} from '../../shared/scholarApplication';
import type { MyScholarApplicationDto, ScholarApplicationDto, ScholarDocumentDto } from '../../shared/types/ApiTypes';
import { UPLOAD_MAX_BYTES } from '../../shared/upload';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';

const QUERY_KEY = [APP_CONSTANTS.QUERY_KEYS.MY_SCHOLAR_APPLICATION];
const MAX_MEGABYTES = UPLOAD_MAX_BYTES / (1024 * 1024);
const labelClass = 'mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]';
const selectClass = 'h-10 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm';

const Field = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) => (
  <div>
    <label htmlFor={htmlFor} className={labelClass}>{label}</label>
    {children}
  </div>
);

/** Hands a fetched document to the browser as a download under its own name. */
const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next task: the browser has started the download by then.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * `/admin/scholar-application` (V-01, #117): the signed-in user's application for the scholar
 * status — the latest one with its status and documents, a withdrawal while it is pending, and the
 * form for a new one when the user may apply (readers and authors without a pending application).
 * The admin's review is V-02 (#118).
 */
const AdminScholarApplicationPage: React.FC = () => {
  const t = useLocale().scholarApplication;
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const stateQuery = useQuery({ queryKey: QUERY_KEY, queryFn: getMyScholarApplication });
  const state = stateQuery.data;

  const setState = (next: MyScholarApplicationDto) => queryClient.setQueryData(QUERY_KEY, next);

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.privacyNote}</p>
      </div>

      {stateQuery.isError ? <Card className="p-6 text-sm text-red-700">{t.loadFailed}</Card> : null}

      {state?.application ? (
        <CurrentApplication
          application={state.application}
          onWithdrawn={(next) => {
            setState(next);
            showNotice('success', t.withdrawn);
          }}
          onError={(message) => showNotice('error', message)}
        />
      ) : null}

      {state && !state.canApply && !state.application ? (
        <Card className="p-6 text-sm text-[var(--color-ink-default)]" data-testid="scholar-role-note">{t.roleNotAllowed}</Card>
      ) : null}

      {state?.canApply ? (
        <ApplicationForm
          onSubmitted={(application) => {
            setState({ canApply: false, application });
            showNotice('success', t.submitted);
          }}
          onProblem={(message) => showNotice('warning', message)}
          onError={(message) => showNotice('error', message)}
        />
      ) : null}
    </div>
  );
};

const CurrentApplication = ({
  application,
  onWithdrawn,
  onError,
}: {
  application: ScholarApplicationDto;
  onWithdrawn: (next: MyScholarApplicationDto) => void;
  onError: (message: string) => void;
}) => {
  const t = useLocale().scholarApplication;
  const format = useFormat();
  const [confirming, setConfirming] = useState(false);
  const withdrawMutation = useMutation({
    mutationFn: withdrawScholarApplication,
    onSuccess: (next) => {
      setConfirming(false);
      onWithdrawn(next);
    },
    onError: (error) => onError(`${t.withdrawFailed}: ${extractApiErrorMessage(error)}`),
  });
  const download = async (document: ScholarDocumentDto) => {
    try {
      saveBlob(await downloadScholarDocument(document.id), document.fileName);
    } catch (error) {
      onError(`${t.downloadFailed}: ${extractApiErrorMessage(error)}`);
    }
  };
  const mazhab = application.mazhab ? t.mazhabs[application.mazhab as ScholarMazhab] ?? application.mazhab : t.mazhabNone;
  const pending = application.status === 'Pending';

  return (
    <Card className="space-y-4 p-6" data-testid="scholar-application-current">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-ink-strong)]">{t.currentTitle}</h2>
        <span data-testid="scholar-application-status" className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-sm font-medium text-[var(--color-ink-default)]">
          {t.status[application.status]}
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {(
          [
            [t.degree, application.degree],
            [t.institution, application.institution],
            [t.specialization, application.specialization],
            [t.mazhab, mazhab],
            [t.submittedAt, format.date(application.submittedAt, 'dateTime')],
            ...(application.closedAt ? [[t.closedAt, format.date(application.closedAt, 'dateTime')]] : []),
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</dt>
            <dd className="mt-1 break-words text-[var(--color-ink-default)]">{value}</dd>
          </div>
        ))}
      </dl>
      {application.documents.length > 0 ? (
        <ul aria-label={t.documentsListLabel} className="space-y-2">
          {application.documents.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border-soft)] px-3 py-2 text-sm">
              <span className="min-w-0 break-all text-[var(--color-ink-default)]">{document.fileName}</span>
              <Button variant="ghost" aria-label={formatMessage(t.download, { name: document.fileName })} onClick={() => void download(document)}>
                <Download size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">{t.noDocuments}</p>
      )}
      {pending ? (
        confirming ? (
          <div role="group" aria-label={t.withdraw} className="space-y-3 rounded-lg bg-[var(--color-surface-muted)] p-4">
            <p className="text-sm text-[var(--color-ink-default)]">{t.withdrawConfirm}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={withdrawMutation.isPending} onClick={() => withdrawMutation.mutate()}>
                {withdrawMutation.isPending ? t.withdrawing : t.withdrawConfirmYes}
              </Button>
              <Button onClick={() => setConfirming(false)}>{t.withdrawCancel}</Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>{t.withdraw}</Button>
        )
      ) : null}
    </Card>
  );
};

const ApplicationForm = ({
  onSubmitted,
  onProblem,
  onError,
}: {
  onSubmitted: (application: ScholarApplicationDto) => void;
  onProblem: (message: string) => void;
  onError: (message: string) => void;
}) => {
  const t = useLocale().scholarApplication;
  const [draft, setDraft] = useState<ScholarApplicationDraft>(EMPTY_SCHOLAR_APPLICATION);
  const fileInput = useRef<HTMLInputElement>(null);
  const change = (patch: Partial<ScholarApplicationDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const submitMutation = useMutation({
    mutationFn: submitScholarApplication,
    onSuccess: (application) => {
      setDraft(EMPTY_SCHOLAR_APPLICATION);
      onSubmitted(application);
    },
    onError: (error) => onError(`${t.submitFailed}: ${extractApiErrorMessage(error)}`),
  });

  const pickDocuments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    // Cleared, so picking the same file again after removing it is a change too.
    event.target.value = '';
    if (files.length > 0) change({ documents: [...draft.documents, ...files] });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = findScholarApplicationProblem(draft);
    if (problem) {
      onProblem(formatMessage(t.problems[problem.kind], {
        name: 'name' in problem ? problem.name : '',
        max: SCHOLAR_MAX_DOCUMENTS,
        maxMegabytes: MAX_MEGABYTES,
      }));
      return;
    }

    submitMutation.mutate(draft);
  };

  return (
    <Card className="p-6">
      <form onSubmit={submit} aria-label={t.formTitle} className="space-y-5">
        <h2 className="text-lg font-semibold text-[var(--color-ink-strong)]">{t.formTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.degree} htmlFor="scholar-degree">
            <Input
              id="scholar-degree"
              required
              maxLength={SCHOLAR_DEGREE_MAX_LENGTH}
              placeholder={t.degreePlaceholder}
              value={draft.degree}
              onChange={(event) => change({ degree: event.target.value })}
            />
          </Field>
          <Field label={t.institution} htmlFor="scholar-institution">
            <Input
              id="scholar-institution"
              required
              autoComplete="organization"
              maxLength={SCHOLAR_INSTITUTION_MAX_LENGTH}
              placeholder={t.institutionPlaceholder}
              value={draft.institution}
              onChange={(event) => change({ institution: event.target.value })}
            />
          </Field>
          <Field label={t.specialization} htmlFor="scholar-specialization">
            <Input
              id="scholar-specialization"
              required
              maxLength={SCHOLAR_SPECIALIZATION_MAX_LENGTH}
              placeholder={t.specializationPlaceholder}
              value={draft.specialization}
              onChange={(event) => change({ specialization: event.target.value })}
            />
          </Field>
          <Field label={t.mazhab} htmlFor="scholar-mazhab">
            <select
              id="scholar-mazhab"
              className={selectClass}
              value={draft.mazhab}
              onChange={(event) => change({ mazhab: event.target.value as ScholarMazhab | '' })}
            >
              <option value="">{t.mazhabNone}</option>
              {SCHOLAR_MAZHABS.map((slug) => (
                <option key={slug} value={slug}>{t.mazhabs[slug]}</option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="space-y-3">
          <legend className={labelClass}>{t.documents}</legend>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {formatMessage(t.documentsHint, { max: SCHOLAR_MAX_DOCUMENTS, maxMegabytes: MAX_MEGABYTES })}
          </p>
          {draft.documents.length > 0 ? (
            <ul className="space-y-2" data-testid="scholar-picked-documents">
              {draft.documents.map((file, index) => (
                // A picked file has no identity of its own: it is removed by position.
                <li key={index} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border-soft)] px-3 py-2 text-sm">
                  <span className="min-w-0 break-all text-[var(--color-ink-default)]">{file.name}</span>
                  <Button
                    variant="ghost"
                    aria-label={formatMessage(t.removeDocument, { name: file.name })}
                    onClick={() => change({ documents: draft.documents.filter((_, position) => position !== index) })}
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={SCHOLAR_DOCUMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="scholar-documents-file"
            onChange={pickDocuments}
          />
          {draft.documents.length < SCHOLAR_MAX_DOCUMENTS ? (
            <Button onClick={() => fileInput.current?.click()}>
              <FilePlus size={16} aria-hidden="true" />
              {t.addDocuments}
            </Button>
          ) : null}
        </fieldset>

        <Button type="submit" variant="primary" disabled={submitMutation.isPending}>
          {submitMutation.isPending ? t.submitting : t.submit}
        </Button>
      </form>
    </Card>
  );
};

export default AdminScholarApplicationPage;
