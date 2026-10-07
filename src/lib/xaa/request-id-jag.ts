import qs from 'qs';
import {
  ClientAssertionOption,
  ClientIdOption,
  IdJagPayload,
  OAuthClientAssertionType,
  OAuthGrantType,
  OAuthRequestError,
  OAuthTokenType,
  SubjectTokenType,
  transformScopes,
} from './types';

export type RequestIdJagOptions = {
  /** Okta token endpoint, e.g. https://your-org.okta.com/oauth2/v1/token */
  tokenUrl: string;
  /** Resource identifier of the resource app (Linear) as registered in the Okta XAA connection */
  audience: string;
  /** Optional RFC 8707 resource indicator (Linear's own base URL), if the IdP forwards it */
  resource?: string;
  subjectToken: string;
  subjectTokenType: SubjectTokenType;
  scopes?: string | Set<string> | string[];
} & (ClientIdOption | ClientAssertionOption);

/**
 * Step 1 of the XAA flow: exchange the user's Okta ID token for a short-lived
 * Identity Assertion JWT Authorization Grant (ID-JAG), per the Identity Assertion
 * Authorization Grant draft, using the OAuth 2.0 Token Exchange grant (RFC 8693).
 */
export async function requestIdJag(opts: RequestIdJagOptions): Promise<IdJagPayload> {
  const subjectTokenUrn =
    opts.subjectTokenType === 'saml' ? OAuthTokenType.SAML2 : OAuthTokenType.ID_TOKEN;

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
    grant_type: OAuthGrantType.TOKEN_EXCHANGE,
    requested_token_type: OAuthTokenType.JWT_ID_JAG,
    audience: opts.audience,
    resource: opts.resource,
    scope: transformScopes(opts.scopes),
    subject_token: opts.subjectToken,
    subject_token_type: subjectTokenUrn,
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

  if (json.issued_token_type !== OAuthTokenType.JWT_ID_JAG) {
    throw new Error(
      `Expected issued_token_type '${OAuthTokenType.JWT_ID_JAG}', got '${String(json.issued_token_type)}'`
    );
  }

  return json as unknown as IdJagPayload;
}
