import NextAuth from 'next-auth';
import Okta from 'next-auth/providers/okta';
import { decodeJwt } from 'jose';
import { refreshOktaIdToken } from '@/lib/xaa/refresh-id-token';

declare module 'next-auth' {
  interface Session {
    userSubject?: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userSubject?: string;
    oktaIdToken?: string;
    oktaIdTokenExpiresAt?: number;
    oktaRefreshToken?: string;
  }
}

const OKTA_TOKEN_URL = process.env.OKTA_TOKEN_URL ?? `${process.env.OKTA_ISSUER}/v1/token`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required when self-hosting outside Vercel (e.g. AWS Amplify) — without
  // this, Auth.js doesn't trust the incoming Host header, which can break
  // cookie handling and silently drop the session.
  trustHost: true,
  providers: [
    Okta({
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      issuer: process.env.OKTA_ISSUER,
      // offline_access is required to get a refresh_token back, so we can
      // mint a fresh ID token later without asking the user to sign in again.
      authorization: { params: { scope: 'openid profile email offline_access' } },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        // Initial sign-in: capture the raw ID token + refresh token. The ID
        // token itself is the "subject_token" the XAA token-exchange step needs.
        token.userSubject = account.providerAccountId;
        token.oktaIdToken = account.id_token as string | undefined;
        token.oktaRefreshToken = account.refresh_token as string | undefined;
        if (account.id_token) {
          const decoded = decodeJwt(account.id_token as string);
          token.oktaIdTokenExpiresAt = (decoded.exp ?? 0) * 1000;
        }
        return token;
      }

      const isExpiringSoon =
        !token.oktaIdTokenExpiresAt || token.oktaIdTokenExpiresAt < Date.now() + 60_000;

      if (isExpiringSoon && token.oktaRefreshToken) {
        try {
          const refreshed = await refreshOktaIdToken({
            tokenUrl: OKTA_TOKEN_URL,
            clientId: process.env.OKTA_CLIENT_ID!,
            clientSecret: process.env.OKTA_CLIENT_SECRET!,
            refreshToken: token.oktaRefreshToken,
          });
          token.oktaIdToken = refreshed.id_token;
          token.oktaIdTokenExpiresAt = Date.now() + refreshed.expires_in * 1000;
          if (refreshed.refresh_token) {
            token.oktaRefreshToken = refreshed.refresh_token;
          }
        } catch (error) {
          console.error('Failed to refresh Okta ID token', error);
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Deliberately do NOT expose oktaIdToken here: this callback also
      // shapes the payload returned by the client-facing /api/auth/session
      // endpoint. Server-side route handlers that need the raw ID token
      // read it directly off the encrypted JWT via next-auth/jwt's
      // getToken(), which never reaches the browser.
      session.userSubject = token.userSubject;
      return session;
    },
  },
});
