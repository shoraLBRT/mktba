/**
 * Arabic inside Russian text (R-15). The reader finds the Arabic runs itself — the author marks
 * nothing — so every article, old and new, gets them without a change to the stored Markdown.
 */

/** Arabic, Arabic Supplement, Arabic Extended-A, Presentation Forms-A and -B. */
const ARABIC = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';

/**
 * What may stand between two Arabic words of one run: spaces, the zero-width non-joiner, digits
 * and neutral punctuation. A run starts and ends on an Arabic character, so punctuation at its edges stays in
 * the surrounding Russian sentence and keeps its place there.
 */
const BETWEEN = '\\s\\u00A0\\u200C0-9.,:;!?()\\[\\]«»"\'\\-\\u2013\\u2014';

const ARABIC_RUN = new RegExp(`[${ARABIC}](?:[${ARABIC}${BETWEEN}]*[${ARABIC}])?`, 'g');
const HAS_ARABIC = new RegExp(`[${ARABIC}]`);
const ARABIC_CHARS = new RegExp(`[${ARABIC}]`, 'g');

/** A piece of a text: Arabic or not. */
export type TextSegment = { text: string; arabic: boolean };

/** Whether the text has any Arabic in it. */
export const hasArabic = (text: string): boolean => HAS_ARABIC.test(text);

/** Splits a text into Arabic runs and the rest, in order; joined back, the pieces give the text. */
export function splitArabicRuns(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(ARABIC_RUN)) {
    const start = match.index;
    if (start > last) {
      segments.push({ text: text.slice(last, start), arabic: false });
    }
    segments.push({ text: match[0], arabic: true });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), arabic: false });
  }
  return segments;
}

/**
 * Whether the text is Arabic and nothing else: no letter of another script. Digits and
 * punctuation are neutral, so an ayah with its reference «(2:255)» still counts.
 */
export const isArabicOnly = (text: string): boolean =>
  hasArabic(text) && !/\p{L}/u.test(text.replace(ARABIC_CHARS, ''));
