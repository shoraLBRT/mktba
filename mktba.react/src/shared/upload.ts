/**
 * Client mirror of the upload limits (U-08, #73; `Uploads` settings and `ImageProcessor` on the
 * server). The server decides by the file's content; this only spares a pointless upload.
 */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** What the file picker offers; the server reads the format from the file itself. */
export const UPLOAD_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export type UploadFileProblem = 'tooLarge' | 'typeUnsupported';

/** Why a picked file will not be accepted, or null when it may be sent. */
export const findUploadFileProblem = (file: Pick<File, 'size' | 'type'>): UploadFileProblem | null => {
  if (file.size > UPLOAD_MAX_BYTES) return 'tooLarge';
  if (file.type && !UPLOAD_IMAGE_ACCEPT.split(',').includes(file.type)) return 'typeUnsupported';
  return null;
};
