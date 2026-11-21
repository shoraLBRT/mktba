import { describe, expect, it } from 'vitest';
import { findUploadFileProblem, UPLOAD_MAX_BYTES } from './upload';

describe('findUploadFileProblem', () => {
  it('given a JPEG, PNG or WebP within the limit, then it may be sent', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(findUploadFileProblem({ size: 1024, type })).toBeNull();
    }
  });

  it('given a file over the limit, then it is too large', () => {
    expect(findUploadFileProblem({ size: UPLOAD_MAX_BYTES + 1, type: 'image/png' })).toBe('tooLarge');
  });

  it('given an SVG or GIF, then its type is not accepted', () => {
    expect(findUploadFileProblem({ size: 10, type: 'image/svg+xml' })).toBe('typeUnsupported');
    expect(findUploadFileProblem({ size: 10, type: 'image/gif' })).toBe('typeUnsupported');
  });

  it('given a file the browser gives no type, then the server decides by its content', () => {
    expect(findUploadFileProblem({ size: 10, type: '' })).toBeNull();
  });
});
