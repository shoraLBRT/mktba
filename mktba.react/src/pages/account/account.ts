/** Helpers of the readers' account pages (U-05, #126). */

/** The token after `#token=` in the page's address, or null; read only in the browser. */
export const tokenFromHash = (hash: string): string | null => {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')?.trim();
  return token ? token : null;
};

/** Where a user lands after signing in: a reader has no dashboard, so their profile. */
export const landingPathOf = (role: string): string => (role === 'Reader' ? '/admin/profile' : '/admin');

export const linkClassName = 'font-medium text-[var(--color-brand-forest)] hover:underline';
