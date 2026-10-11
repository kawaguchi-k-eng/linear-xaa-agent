import { exchangeIdJag } from './exchange-id-jag';
import { requestIdJag } from './request-id-jag';
import { ResourceAccessTokenPayload } from './types';

type CacheEntry = { token: string; expiresAt: number };

/** Scopes the Taskboard resource app defines. */
export type ResourceScope = 'read' | 'write';

/**
 * Demo-only in-memory cache, keyed by the Okta user subject plus the
 * requested scopes (a read-only token must never satisfy a write request).
 * On serverless hosts (Amplify/Lambda) with multiple concurrent instances this
 * cache is per-instance, not shared. For production, replace with a shared
 * store (DynamoDB, Redis, etc.) keyed by user id.
 */
const tokenCache = new Map<string, CacheEntry>();

export type ResourceTokenConfig = {
  /** The ORG authorization server's token endpoint — ID-JAG exchange only
   * works there, never on a custom authorization server (e.g. /oauth2/default). */
  oktaOrgTokenUrl: string;
  requestingAppClientId: string;
  requestingAppClientSecret: string;
  /** The resource app's registered "Issuer URL" (Okta XAA Callers config) —
   * this, not the Audience/tenant ID, is the `audience` the org token
   * endpoint expects on the ID-JAG request. */
  resourceIssuerUrl: string;
  resourceIdentifier: string;
  resourceTokenUrl: string;
  resourceExternalClientId: string;
  resourceExternalClientSecret?: string;
};

export function readResourceTokenConfigFromEnv(): ResourceTokenConfig {
  const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };

  // The "requesting app" is normally the same Okta app used for sign-in
  // (src/auth.ts), so these fall back to the standard NextAuth Okta env vars
  // unless a dedicated app was registered just for the token exchange.
  const oktaIssuer = process.env.OKTA_ISSUER;

  // ID-JAG exchange is only supported on the org authorization server
  // (https://{yourOktaDomain}/oauth2/v1/token), never on a custom one like
  // /oauth2/default — even though /oauth2/default is correct for normal
  // sign-in. Default by stripping any authorization-server path off the issuer.
  const orgTokenUrl =
    process.env.OKTA_ORG_TOKEN_URL ??
    (oktaIssuer ? `${new URL(oktaIssuer).origin}/oauth2/v1/token` : undefined);

  return {
    oktaOrgTokenUrl: orgTokenUrl ?? required('OKTA_ORG_TOKEN_URL'),
    requestingAppClientId: process.env.OKTA_REQUESTING_APP_CLIENT_ID ?? required('OKTA_CLIENT_ID'),
    requestingAppClientSecret:
      process.env.OKTA_REQUESTING_APP_CLIENT_SECRET ?? required('OKTA_CLIENT_SECRET'),
    resourceIssuerUrl: required('RESOURCE_ISSUER_URL'),
    resourceIdentifier: required('RESOURCE_IDENTIFIER'),
    resourceTokenUrl: required('RESOURCE_TOKEN_URL'),
    resourceExternalClientId: required('RESOURCE_EXTERNAL_CLIENT_ID'),
    resourceExternalClientSecret: process.env.RESOURCE_EXTERNAL_CLIENT_SECRET,
  };
}

/**
 * Runs the full two-step XAA flow and returns an access token for the
 * resource app (Taskboard0), scoped to the given user, reusing a cached
 * token while it remains valid.
 *
 * Callers request only the scopes the current operation needs (least
 * privilege). Okta rejects the whole request with `invalid_scope` if any
 * requested scope isn't granted in the XAA connection, so asking for more
 * than needed would also break operations that are still permitted.
 *
 * @param userSubject stable identifier for the signed-in user (e.g. Okta `sub`)
 * @param oktaIdToken the user's current Okta OIDC ID token
 * @param scopes the scopes this operation needs
 */
export async function getResourceAccessToken(
  userSubject: string,
  oktaIdToken: string,
  scopes: ResourceScope[],
  config: ResourceTokenConfig = readResourceTokenConfigFromEnv()
): Promise<string> {
  const cacheKey = `${userSubject} ${[...scopes].sort().join(' ')}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 10_000) {
    return cached.token;
  }

  const idJag = await requestIdJag({
    tokenUrl: config.oktaOrgTokenUrl,
    audience: config.resourceIssuerUrl,
    resource: config.resourceIdentifier,
    subjectToken: oktaIdToken,
    subjectTokenType: 'oidc',
    scopes,
    clientID: config.requestingAppClientId,
    clientSecret: config.requestingAppClientSecret,
  });

  const accessToken: ResourceAccessTokenPayload = await exchangeIdJag({
    tokenUrl: config.resourceTokenUrl,
    idJag: idJag.access_token,
    scopes,
    clientID: config.resourceExternalClientId,
    clientSecret: config.resourceExternalClientSecret,
  });

  const expiresInMs = (accessToken.expires_in ?? 3600) * 1000;
  tokenCache.set(cacheKey, {
    token: accessToken.access_token,
    expiresAt: Date.now() + expiresInMs,
  });

  return accessToken.access_token;
}
