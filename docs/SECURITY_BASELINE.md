# Security baseline — Phase 0

This is a private POC rather than a public enterprise service. The goal is proportionate controls: protect credentials and private data from the start without premature infrastructure.

## In scope now

- Keep secrets out of Git with `.env*` ignored and `.env.example` containing placeholders only.
- Keep provider and tool credentials out of browser persistence. Phase 0 removes legacy localStorage fields for API keys.
- Keep integration switches disabled until their server implementation and validation exist.
- Use server-only route handlers for future external calls; never use `NEXT_PUBLIC_*` for secrets.
- Typecheck and build before merging.

## Required before live credentials

- Supabase Auth, route middleware, and RLS policies/tests for every user-owned table.
- Application-level authenticated encryption with a versioned server-only secret.
- Request validation, rate limits, and audit metadata for credential and chat endpoints.
- Safe provider status responses that never return raw credentials.

## Deliberately deferred

- SSO, enterprise audit exports, complex roles, background jobs, and scheduled agents.
- File uploads until type/size validation and isolated storage are designed.
- Broad Apify actor access; the first tool layer uses a small allowlist and constrained schemas.

## Release check

Before private live-user access, verify that no API key can be found in browser storage, page source, logs, Git history, or health responses. Confirm protected routes reject unauthenticated access and cross-user Supabase reads/writes.
