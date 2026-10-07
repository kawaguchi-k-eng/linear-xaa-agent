import qs from 'qs';
import {
  ClientAssertionOption,
  ClientIdOption,
  ResourceAccessTokenPayload,
  OAuthClientAssertionType,
  OAuthGrantType,
  OAuthRequestError,
  transformScopes,
} from './types';

export type ExchangeIdJagOptions = {
  /** The resource app's own token endpoint (Linear's authorization server) */
  tokenUrl: string;
  /** The ID-JAG obtained from requestIdJag() */
  idJag: string;
  scopes?: string | Set<string> | string[];
} & (ClientIdOption | ClientAssertionOption);

/**
 * Step 2 of the XAA flow: redeem the ID-JAG at the resource app's (Linear's)
 * own authorization server for an access token, using the JWT Bearer
 * authorization grant (RFC 7523).
 */
export async function exchangeIdJag(
  opts: ExchangeIdJagOptions
): Promise<ResourceAccessTokenPayload> {
  const clientFields =
    'clientID' in opts
      ? {
          client_id: opts.clientID,
          ...(opts.clientSecret ? { client_secret: opts.clientSecret } : null),
        }
      : {
          client_assertion_type: OAuthClientAssertionType.JWT_BEARER,
          client_assertion: opts.clientAssertion,
        };

  const body = qs.stringify({
    grant_type: OAuthGrantType.JWT_BEARER,
    assertion: opts.idJag,
    scope: transformScopes(opts.scopes),
    ...clientFields,
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

  return json as unknown as ResourceAccessTokenPayload;
}
