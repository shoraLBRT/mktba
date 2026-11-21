/**
 * The Markdown of an uploaded image (U-08, #73): `![alt](url)`, the stored format the reader's
 * `MarkdownContent` renders. The description is one line with backslashes and square brackets
 * escaped, so it cannot end the image early; an address with white space, parentheses or angle
 * brackets goes in `<…>` (an upload's own address never has them).
 */
export const imageMarkdown = (alt: string, url: string): string => {
  const text = alt.replace(/\s+/g, ' ').trim().replace(/[\\[\]]/g, '\\$&');
  const destination = /[\s()<>]/.test(url) ? `<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>` : url;
  return `![${text}](${destination})`;
};

/** The description an image starts with: the file's name without its extension, words apart. */
export const altFromFileName = (name: string): string =>
  name.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The first image file among dropped or pasted files, or null. */
export const firstImageFile = (files: FileList | readonly File[] | null | undefined): File | null =>
  Array.from(files ?? []).find((file) => file.type.startsWith('image/')) ?? null;

/**
 * The image file a paste carries, or null. Only a paste without text counts (a screenshot, an
 * image copied from a page): Word puts a picture of the copied text beside the text itself, and
 * that paste stays text.
 */
export const pastedImageFile = (data: DataTransfer | null): File | null =>
  data && !data.types.includes('text/plain') ? firstImageFile(data.files) : null;
