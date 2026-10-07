import qs from 'qs';
import { OAuthRequestError } from './types';

export type RefreshedIdToken = {
  id_token: string;
  refresh_token?: string;
  expires_in: number;
};

/**
 * Okta ID tokens are short-lived. Rather than forcing the user to sign in
 * again every time it expires, use the refresh token obtained at login
 * (requires the `offline_access` scope) to mint a fresh ID token on demand.
 */
export async function refreshOktaIdToken(opts: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<RefreshedIdToken> {
  const body = qs.stringify({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });

  const response = await fetch(opts.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new OAuthRequestError(response.status, json as never);
  }

  return json as unknown as RefreshedIdToken;
}
