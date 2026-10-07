export enum OAuthGrantType {
  TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange',
  JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer',
}

export enum OAuthTokenType {
  ID_TOKEN = 'urn:ietf:params:oauth:token-type:id_token',
  SAML2 = 'urn:ietf:params:oauth:token-type:saml2',
  JWT_ID_JAG = 'urn:ietf:params:oauth:token-type:id-jag',
}

export enum OAuthClientAssertionType {
  JWT_BEARER = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
}

export type SubjectTokenType = 'oidc' | 'saml';

export type ClientIdOption = {
  clientID: string;
  clientSecret?: string;
};

export type ClientAssertionOption = {
  clientAssertion: string;
};

export type OAuthErrorPayload = {
  error: string;
  error_description?: string;
};

export class OAuthRequestError extends Error {
  constructor(
    public status: number,
    public body: OAuthErrorPayload | string
  ) {
    super(
      `OAuth request failed with status ${status}: ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`
    );
    this.name = 'OAuthRequestError';
  }
}

export type IdJagPayload = {
  access_token: string;
  issued_token_type: OAuthTokenType.JWT_ID_JAG;
  token_type: string;
  expires_in?: number;
};

export type ResourceAccessTokenPayload = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

function transformScopes(scopes?: string | Set<string> | string[]): string {
  if (!scopes) return '';
  if (typeof scopes === 'string') return scopes;
  return Array.from(scopes).join(' ');
}

export { transformScopes };
