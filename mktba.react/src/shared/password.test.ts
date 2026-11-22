import { describe, expect, it } from 'vitest';
import { findPasswordProblem, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordFieldOfApiError } from './password';

describe('findPasswordProblem', () => {
  it.each(['correct horse', 'Test-password-1', 'пароль-из-слов', '            x'])(
    'given a long enough password (%s), when checked, then it is accepted',
    (password) => expect(findPasswordProblem(password, 'admin@mktba.test')).toBeUndefined(),
  );

  it('given passwords at both bounds, when checked, then they are accepted and one past them is not', () => {
    expect(findPasswordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 1) + 'b', '')).toBeUndefined();
    expect(findPasswordProblem('a'.repeat(PASSWORD_MIN_LENGTH - 2) + 'b', '')).toBe('password_too_short');
    expect(findPasswordProblem('a'.repeat(PASSWORD_MAX_LENGTH - 1) + 'b', '')).toBeUndefined();
    expect(findPasswordProblem('a'.repeat(PASSWORD_MAX_LENGTH) + 'b', '')).toBe('password_too_long');
  });

  it('given characters outside the basic plane, when checked, then each counts as one, as on the server', () => {
    const eleven = '😀'.repeat(5) + '🌙'.repeat(6);
    expect(findPasswordProblem(eleven, '')).toBe('password_too_short');
    expect(findPasswordProblem(eleven + '🌙', '')).toBeUndefined();
  });

  it.each([
    ['aaaaaaaaaaaaaa', 'admin@mktba.test'],
    ['Long.Name@Mktba.test', ' long.name@mktba.test '],
    ['LONG.NAME.HERE', 'long.name.here@mktba.test'],
  ])('given the email or one repeated character (%s), when checked, then it is too simple', (password, email) =>
    expect(findPasswordProblem(password, email)).toBe('password_too_simple'),
  );
});

describe('passwordFieldOfApiError', () => {
  it('given a password rule code, when mapped, then it belongs to the password field, and other codes to the form', () => {
    expect(passwordFieldOfApiError('password_too_short')).toBe('password');
    expect(passwordFieldOfApiError('password_too_simple')).toBe('password');
    expect(passwordFieldOfApiError('invite_used')).toBeNull();
    expect(passwordFieldOfApiError(undefined)).toBeNull();
  });
});
