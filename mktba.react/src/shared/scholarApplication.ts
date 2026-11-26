import type { ScholarApplicantDto, ScholarApplicationStatus } from './types/ApiTypes';
import { UPLOAD_MAX_BYTES } from './upload';

/**
 * Client mirror of the scholar application rules (V-01, #117; `ScholarApplication` and
 * `ScholarDocumentProcessor` on the server). The server decides, by the files' content; this only
 * spares a pointless upload and points at what to fix.
 */
export const SCHOLAR_DEGREE_MAX_LENGTH = 150;
export const SCHOLAR_INSTITUTION_MAX_LENGTH = 200;
export const SCHOLAR_SPECIALIZATION_MAX_LENGTH = 200;
export const SCHOLAR_MAX_DOCUMENTS = 5;

/** What the file picker offers; the server reads the format from the file itself. */
export const SCHOLAR_DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** The canonical schools an applicant may name, by slug; none is allowed too. */
export const SCHOLAR_MAZHABS = ['hanafi', 'maliki', 'shafii', 'hanbali'] as const;

export type ScholarMazhab = (typeof SCHOLAR_MAZHABS)[number];

export const isScholarMazhab = (value: string | null | undefined): value is ScholarMazhab =>
  (SCHOLAR_MAZHABS as readonly string[]).includes(value ?? '');

export type ScholarApplicationDraft = {
  degree: string;
  institution: string;
  specialization: string;
  mazhab: ScholarMazhab | '';
  documents: readonly File[];
};

export const EMPTY_SCHOLAR_APPLICATION: ScholarApplicationDraft = {
  degree: '',
  institution: '',
  specialization: '',
  mazhab: '',
  documents: [],
};

export type ScholarApplicationProblem =
  | { kind: 'degreeRequired' | 'institutionRequired' | 'specializationRequired' | 'documentsRequired' | 'documentsTooMany' }
  | { kind: 'documentTooLarge' | 'documentTypeUnsupported'; name: string };

/** The first thing that keeps the draft from being sent, in the form's order; null when it may go. */
export const findScholarApplicationProblem = (draft: ScholarApplicationDraft): ScholarApplicationProblem | null => {
  if (!draft.degree.trim()) return { kind: 'degreeRequired' };
  if (!draft.institution.trim()) return { kind: 'institutionRequired' };
  if (!draft.specialization.trim()) return { kind: 'specializationRequired' };
  if (draft.documents.length === 0) return { kind: 'documentsRequired' };
  if (draft.documents.length > SCHOLAR_MAX_DOCUMENTS) return { kind: 'documentsTooMany' };
  const accepted = SCHOLAR_DOCUMENT_ACCEPT.split(',');
  for (const file of draft.documents) {
    if (file.size > UPLOAD_MAX_BYTES) return { kind: 'documentTooLarge', name: file.name };
    if (file.type && !accepted.includes(file.type)) return { kind: 'documentTypeUnsupported', name: file.name };
  }

  return null;
};

/** The multipart form `POST /scholar-application` reads. */
export const buildScholarApplicationForm = (draft: ScholarApplicationDraft): FormData => {
  const form = new FormData();
  form.append('degree', draft.degree.trim());
  form.append('institution', draft.institution.trim());
  form.append('specialization', draft.specialization.trim());
  form.append('mazhab', draft.mazhab);
  for (const file of draft.documents) form.append('documents', file, file.name);
  return form;
};

/** The statuses of an application, in the order of the API's enum (V-02, #118: the admin's filter). */
export const SCHOLAR_APPLICATION_STATUSES: readonly ScholarApplicationStatus[] = ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Revoked'];

/** Must match `ScholarApplication.ReasonMaxLength` on the server. */
export const SCHOLAR_DECISION_REASON_MAX_LENGTH = 1000;

/** The applicant as the admin sees them: the name and the email, or the email alone. */
export const applicantLabel = (applicant: ScholarApplicantDto): string =>
  applicant.displayName ? `${applicant.displayName} (${applicant.email})` : applicant.email;
