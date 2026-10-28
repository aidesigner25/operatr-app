# Security baseline — Phase 1

This is a private POC rather than a public enterprise service. The goal is proportionate controls: protect credentials and private data from the start without premature infrastructure.

## In scope now

- Keep secrets out of Git with `.env*` ignored and `.env.example` containing placeholders only.
- Keep provider and tool credentials out of browser persistence. Phase 0 removes legacy localStorage fields for API keys.
- Keep integration switches disabled until their server implementation and validation exist.
- Use server-only route handlers for future external calls; never use `NEXT_PUBLIC_*` for secrets.
- Typecheck and build before merging.

## Required before live credentials

- Supabase Auth, protected-route proxy, and RLS policies for every current user-owned table.
- Application-level authenticated encryption with a versioned server-only AES-256 secret.
- Request validation, process-local POC rate limits, and audit metadata for credential endpoints.
- Safe provider status responses that never return raw credentials.

## Phase 1 controls

- Authenticated session tokens use `HttpOnly` cookies; they are not persisted in localStorage.
- The credential API accepts only an allowlist of providers, validates a bounded input, and never logs or returns the input.
- Each vault write uses AES-256-GCM with a 32-byte server-only key. The payload includes an encryption version and key ID to permit planned rotation.
- Ciphertext is bound as additional authenticated data to the Supabase user ID and provider name.
- Database calls carry the authenticated user JWT rather than a service-role key, so RLS applies to normal application reads and writes.
- The current rate limit is intentionally process-local. Replace it with a shared limiter before deploying more than one application instance.
- Chat conversation and message tables use user-scoped RLS. A message insertion must also reference a conversation owned by the same authenticated user.
- The chat route decrypts the selected provider credential only after session and conversation ownership checks. It does not log, return, or persist plaintext credentials.
- Cross-provider fallback remains absent. A chat request is sent only to the provider selected by the user for that conversation.
- Assistant Markdown is rendered without raw HTML support. Model output can format content but cannot inject executable markup into the chat UI.

## Deliberately deferred

- SSO, enterprise audit exports, complex roles, background jobs, and scheduled agents.
- File uploads until type/size validation and isolated storage are designed.
- Broad Apify actor access; the first tool layer uses a small allowlist and constrained schemas.

## Release check

Before private live-user access, verify that no API key can be found in browser storage, page source, logs, Git history, or health responses. Confirm protected routes reject unauthenticated access and cross-user Supabase reads/writes.

Apply the migration and use the checklist in [Phase 1 setup](./PHASE_1_SETUP.md) before testing real keys.
