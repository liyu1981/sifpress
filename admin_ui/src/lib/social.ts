import type { TFunction } from 'i18next';

/**
 * Helpers shared by the login page and My Account for the social sign-in
 * redirects. The OAuth callback answers with a `302` back into the SPA and
 * reports the outcome in the query string (see src/oauth.php), so both
 * surfaces read it from the document URL rather than from an API response.
 */

/** Value of a redirect flag (`?social_error=no_account`), or null. */
export function socialFlagFromUrl(name: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get(name);

  return value === null || value === '' ? null : value;
}

/**
 * Localized message for a callback error code. Unknown codes fall back to a
 * generic sentence, so a newer backend never shows a raw key to the user.
 */
export function socialErrorMessage(t: TFunction, code: string): string {
  return t(`social.error.${code}`, { defaultValue: t('social.error.generic') });
}
