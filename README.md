# Taskboard Agent (Okta Cross App Access)

Custom AI agent that reasons with the OpenAI API and reaches **Taskboard0**
— a self-hosted, Linear-style demo issue tracker (see the sibling
`taskboard0-resource-app` project) — through Okta's Cross App Access (XAA) /
Identity Assertion Authorization Grant (ID-JAG) flow. No per-connector OAuth
consent screen, and no dependency on a Claude Team/Enterprise plan or on a
commercial app's paid SSO tier (Linear's own XAA support turned out to
require a SAML SSO plan we don't have — see `taskboard0-resource-app`'s
README for why it exists). Built with Next.js so it ports to AWS Amplify
Hosting with no code changes — see [Deploying to AWS
Amplify](#deploying-to-aws-amplify).

## How the auth flow works

1. User signs in with Okta (NextAuth / Auth.js), yielding an Okta **ID token**.
2. Server exchanges that ID token for a short-lived **ID-JAG** at Okta's
   **org authorization server** token endpoint
   (`urn:ietf:params:oauth:grant-type:token-exchange`), scoped to
   the resource app's identifier. See `src/lib/xaa/request-id-jag.ts`.
3. Server redeems the ID-JAG at **Taskboard0's own token endpoint**
   (`/oauth/token`) for an access token (`urn:ietf:params:oauth:grant-type:jwt-bearer`).
   See `src/lib/xaa/exchange-id-jag.ts`.
4. The chat API (`src/app/api/chat/route.ts`) uses that access token to call
   Taskboard0's REST API on the user's behalf, driven by OpenAI function calling.

The raw ID token never reaches the browser — see the comment in `src/auth.ts`.

## Hard-won gotchas setting this up against real Okta

These cost real debugging time against a live Okta org — worth knowing up front:

- **Normal sign-in uses the custom authorization server** (`OKTA_ISSUER`,
  e.g. `.../oauth2/default`), **but ID-JAG exchange only works against the
  org authorization server** (`https://{yourOktaDomain}/oauth2/v1/token`).
  Using the custom AS for the ID-JAG request fails with `invalid_request:
  'requested_token_type' is invalid or not supported`. This app derives the
  org token URL from `OKTA_ISSUER` automatically (`OKTA_ORG_TOKEN_URL` to
  override).
- **The `audience` parameter on the ID-JAG request is the resource app's
  "Issuer URL," not its "Audience/tenant ID."** Sending the Audience/tenant
  ID value instead fails with `invalid_target: Token Exchange requests must
  include a valid audience of the authorization server`.
- **That "Issuer URL" must be a real, Okta-reachable URL.** It passes
  Okta's save-time validation with almost any placeholder (it only rejects
  literal `localhost`), but a URL Okta can't actually reach fails silently
  at request time with a confusing `access_denied: User is not assigned to
  the client application` error that has nothing to do with assignments.
- **The signed-in user needs to be assigned to the resource app too** —
  not just the requesting app used for sign-in. (This is a real, separate
  requirement from the point above; both can produce the same misleading
  "User is not assigned" error, so check both if you hit it.)

## Prerequisites (Okta admin console)

1. Enable **Cross App Access**: `Settings > Features > Early access`.
2. Register this app as the **Requesting App** (AI agent):
   `Directory > AI agents > Register AI agent`. Use the same OIDC app for
   sign-in (`OKTA_CLIENT_ID`/`OKTA_CLIENT_SECRET` below) unless you want a
   dedicated one for the token exchange. Assign your test user to it.
3. Set this app's **Login redirect URI** to
   `{AUTH_URL}/api/auth/callback/okta` (e.g. `http://localhost:3002/api/auth/callback/okta`
   locally) — a mismatch here is the most common first error.
4. On Taskboard0 (the resource app): enable XAA, assign your test user to
   it too, and set its "Issuer URL"/"Audience/tenant ID" to its real
   deployed URL — see `taskboard0-resource-app`'s README.
5. Create the XAA connection: `Directory > AI Agents > <this agent> >
   Resource connections > Add resource connection`, selecting Taskboard0.
   The "external client ID" you enter there is `RESOURCE_EXTERNAL_CLIENT_ID`
   here, and must appear in Taskboard0's `TRUSTED_REQUESTING_APP_CLIENT_IDS`.

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in .env.local, then:
npx auth secret   # writes AUTH_SECRET into .env.local
npm run dev -- -p 3002   # Taskboard0 itself defaults to :3000
```

See `.env.local.example` for every variable and where it comes from. You'll
need `taskboard0-resource-app` running (or deployed) too — see its own README.

## Deploying to AWS Amplify

Stock Next.js App Router project — Amplify Hosting builds and serves it
(including the API routes, server actions, and NextAuth) using the included
`amplify.yml`.

**Important**: Amplify Console environment variables are build-phase only
by default — Next.js server code (route handlers, server actions,
`src/auth.ts`) can't see them at request time unless they're written into
`.env.production` during the build. `amplify.yml` already does this for
this app's required vars; add any new var's name to the `env | grep -e ...`
line there too.

**Security tradeoff to be aware of**: this means `OKTA_CLIENT_SECRET` and
`OPENAI_API_KEY` end up baked into the build artifact alongside your code
(the AWS docs on SSR env vars warn about exactly this: "users with access
to deploy artifacts can read them"). That's a reasonable tradeoff for a
personal demo in your own AWS account, but think twice before doing this
for anything handling real user data or a shared AWS account — the
AWS-recommended alternative is to give the SSR compute function an IAM role
and fetch secrets from Secrets Manager at runtime instead.

Set `AUTH_URL` to the deployed domain, and set `RESOURCE_ISSUER_URL`/
`RESOURCE_IDENTIFIER`/`RESOURCE_TOKEN_URL`/`TASKBOARD_API_URL` to wherever
Taskboard0 itself is deployed.

## Project layout

- `src/lib/xaa/` — the two XAA token exchanges (RFC 8693 token-exchange, RFC
  7523 JWT bearer), token caching, and ID token refresh.
- `src/lib/taskboard.ts` — REST client for the Taskboard0 resource app.
- `src/lib/agent-tools.ts` — OpenAI function-calling tool definitions mapped
  to the Taskboard0 client.
- `src/auth.ts` — Okta sign-in via NextAuth/Auth.js.
- `src/app/api/chat/route.ts` — chat endpoint: XAA token exchange + OpenAI
  tool-calling loop.
- `src/app/page.tsx`, `src/app/chat.tsx` — sign-in gate + chat UI.

## Known limitations of this demo

- The access-token cache in `src/lib/xaa/get-resource-token.ts` is an
  in-memory `Map`. On Amplify/Lambda with multiple concurrent instances this
  cache is per-instance. Replace with a shared store (DynamoDB, etc.) before
  relying on this beyond a demo.
- No persistence/database; conversation history lives only in the browser tab.
- See the Amplify deployment section above re: secrets ending up in the
  build artifact.
