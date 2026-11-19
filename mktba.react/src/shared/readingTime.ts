/** Words a reader gets through in a minute; on the slow side, the texts carry terms and quotes. */
export const READING_WORDS_PER_MINUTE = 180;

const fencedCode = /```[\s\S]*?```/g;
const htmlTag = /<[^>]+>/g;
/** `![alt](url)` and `[text](url)`: the visible text stays, the address goes. */
const linkOrImage = /!?\[([^\]]*)\]\([^)]*\)/g;
const word = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

/** The number of words a reader sees in a Markdown text: markup, addresses and code fences are not counted. */
export const countWords = (markdown: string): number =>
  markdown
    .replace(fencedCode, ' ')
    .replace(linkOrImage, '$1')
    .replace(htmlTag, ' ')
    .match(word)?.length ?? 0;

/**
 * Minutes it takes to read the texts, rounded up; `null` when there is nothing to read
 * (a stub), so the page shows no estimate at all.
 */
export const estimateReadingMinutes = (texts: string[]): number | null => {
  const words = texts.reduce((total, text) => total + countWords(text), 0);
  return words === 0 ? null : Math.ceil(words / READING_WORDS_PER_MINUTE);
};
