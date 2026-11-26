import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCHOLAR_APPLICATION,
  SCHOLAR_MAX_DOCUMENTS,
  buildScholarApplicationForm,
  findScholarApplicationProblem,
  type ScholarApplicationDraft,
} from './scholarApplication';
import { UPLOAD_MAX_BYTES } from './upload';

const pdf = (name = 'диплом.pdf', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

const filled = (patch: Partial<ScholarApplicationDraft> = {}): ScholarApplicationDraft => ({
  ...EMPTY_SCHOLAR_APPLICATION,
  degree: 'Магистр',
  institution: 'Аль-Азхар',
  specialization: 'Фикх',
  documents: [pdf()],
  ...patch,
});

describe('findScholarApplicationProblem', () => {
  it('given a filled draft, when checked, then nothing keeps it from being sent', () => {
    expect(findScholarApplicationProblem(filled())).toBeNull();
  });

  it('given blank fields, when checked, then the first one in the form order is named', () => {
    expect(findScholarApplicationProblem(EMPTY_SCHOLAR_APPLICATION)).toEqual({ kind: 'degreeRequired' });
    expect(findScholarApplicationProblem(filled({ institution: '  ' }))).toEqual({ kind: 'institutionRequired' });
    expect(findScholarApplicationProblem(filled({ specialization: '' }))).toEqual({ kind: 'specializationRequired' });
  });

  it('given no or too many documents, when checked, then the count is the problem', () => {
    expect(findScholarApplicationProblem(filled({ documents: [] }))).toEqual({ kind: 'documentsRequired' });
    const tooMany = Array.from({ length: SCHOLAR_MAX_DOCUMENTS + 1 }, (_, index) => pdf(`${index}.pdf`));
    expect(findScholarApplicationProblem(filled({ documents: tooMany }))).toEqual({ kind: 'documentsTooMany' });
  });

  it('given a too large or foreign file, when checked, then that file is named', () => {
    expect(findScholarApplicationProblem(filled({ documents: [pdf('big.pdf', UPLOAD_MAX_BYTES + 1)] })))
      .toEqual({ kind: 'documentTooLarge', name: 'big.pdf' });
    const word = new File(['x'], 'cv.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect(findScholarApplicationProblem(filled({ documents: [pdf(), word] })))
      .toEqual({ kind: 'documentTypeUnsupported', name: 'cv.docx' });
  });
});

describe('buildScholarApplicationForm', () => {
  it('given a draft, when built, then the fields are trimmed and every document goes under documents', () => {
    const form = buildScholarApplicationForm(filled({ degree: ' Магистр ', mazhab: 'maliki', documents: [pdf('a.pdf'), pdf('b.pdf')] }));

    expect(form.get('degree')).toBe('Магистр');
    expect(form.get('mazhab')).toBe('maliki');
    expect(form.getAll('documents').map((file) => (file as File).name)).toEqual(['a.pdf', 'b.pdf']);
  });
});
