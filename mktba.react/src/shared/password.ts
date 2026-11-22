/**
 * New-password rules on the client (U-06, #134): they mirror `PasswordRules` in Mktba.Application, which
 * checks whatever the registration form sends. Signing in applies none of them.
 */

/** Fewest characters of a new password (`PasswordRules.MinLength`). */
export const PASSWORD_MIN_LENGTH = 12;
/** Most characters of a new password (`PasswordRules.MaxLength`). */
export const PASSWORD_MAX_LENGTH = 128;

/** What is wrong with a new password; the API's error code for the same rule, so one message (`apiErrors`) serves both. */
export type PasswordProblem = 'password_too_short' | 'password_too_long' | 'password_too_simple';

/**
 * The first rule `password` breaks for an account with `email`, or undefined. Length counts code points,
 * like `EnumerateRunes` on the server; the password is taken as typed, without trimming.
 */
export const findPasswordProblem = (password: string, email: string): PasswordProblem | undefined => {
  const characters = [...password];
  if (characters.length < PASSWORD_MIN_LENGTH) return 'password_too_short';
  if (characters.length > PASSWORD_MAX_LENGTH) return 'password_too_long';

  if (characters.every((character) => character === characters[0])) return 'password_too_simple';
  const normalizedEmail = email.trim().toLowerCase();
  const lowered = password.toLowerCase();
  const at = normalizedEmail.indexOf('@');
  if (normalizedEmail && (lowered === normalizedEmail || (at > 0 && lowered === normalizedEmail.slice(0, at)))) {
    return 'password_too_simple';
  }

  return undefined;
};

/** The form field an API error of registration belongs to, or null when it is about the whole form. */
export const passwordFieldOfApiError = (code: string | undefined): 'password' | null =>
  code === 'password_too_short' || code === 'password_too_long' || code === 'password_too_simple' ? 'password' : null;
