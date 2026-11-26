/** Hands a fetched file to the browser as a download under its own name. */
export const saveBlob = (blob: Blob, fileName: string) => {
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
