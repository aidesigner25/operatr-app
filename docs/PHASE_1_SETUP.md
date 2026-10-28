# Phase 1 setup — Supabase Auth and BYOK vault

## 1. Create/configure the Supabase project

Enable Email/Password sign-in in Supabase Auth. For local development, set the Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth?mode=signin&confirmed=1` as an Auth redirect URL. The app uses that route after email confirmation so users land on a clear Sign in state rather than the landing page. Add the deployed equivalent before a preview or production test.

If you have customized the confirmation email template, keep using Supabase's `{{ .ConfirmationURL }}` (or use `{{ .RedirectTo }}` when constructing a custom link) so the requested redirect URL is retained.

## 2. Apply the schema

Run [`supabase/migrations/202610280001_phase1_identity_vault.sql`](../supabase/migrations/202610280001_phase1_identity_vault.sql) in the Supabase SQL editor, or through the Supabase CLI if the project is linked. This enables RLS and creates the profile, encrypted credential, and non-sensitive audit tables.

## 3. Configure local environment

Copy the values into a local `.env.local` (never commit it):

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
OPERATR_KEY_ENCRYPTION_SECRET=BASE64URL_32_BYTE_SECRET
OPERATR_KEY_ENCRYPTION_KEY_ID=primary-v1
```

Generate the encryption secret once and put it in the deployment's secret manager as well:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Do not rotate or replace this key after storing credentials without a planned decrypt-and-reencrypt migration. `SUPABASE_SERVICE_ROLE_KEY` remains optional for this phase and is deliberately not used on vault requests so RLS is exercised.

## 4. Verify before storing a real provider key

1. Start the app, create an account, and confirm email if that Supabase setting is enabled.
2. Open a protected URL in a private window; it must redirect to `/auth`.
3. Sign in and save one disposable/test provider key from Integrations. The status may show only its final four characters.
4. In the SQL editor, verify the `encrypted_credential` begins with `v1.` and is not plaintext.
5. Sign in as a second user and verify the first user's credential row and audit events are invisible and cannot be changed.
6. Confirm browser local storage contains no provider key and the Network response bodies contain no raw key.

Provider, search, scraping, and OAuth feature flags must remain `false`; Phase 1 stores credentials but does not make live calls.
