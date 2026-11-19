const TOKEN_KEY = 'mktba.admin.token';

// Key used before the rename from WikiWeaver; read once and moved to TOKEN_KEY so signed-in admins stay signed in.
const LEGACY_TOKEN_KEY = 'wikiweaver.admin.token';

export const ADMIN_SESSION_EXPIRED_EVENT = 'mktba:admin-session-expired';

export const getStoredAdminToken = (): string | null => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token !== null) {
    return token;
  }

  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken === null) {
    return null;
  }

  localStorage.setItem(TOKEN_KEY, legacyToken);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  return legacyToken;
};

export const setStoredAdminToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
};

export const clearStoredAdminToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
};

export const notifyAdminSessionExpired = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
};
