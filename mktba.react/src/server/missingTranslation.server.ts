import { parseMissingTranslation, type MissingTranslationMode } from '../shared/missingTranslation';

// Node's `process`; the app's TypeScript config has browser types only.
declare const process: { env: Record<string, string | undefined> };

/**
 * The site's missing-translation setting (I-08, #112), read at runtime: `MISSING_TRANSLATION` =
 * `original` (default) or `hide`; anything else is the default.
 */
export const resolveMissingTranslation = (): MissingTranslationMode =>
  parseMissingTranslation(process.env.MISSING_TRANSLATION);
