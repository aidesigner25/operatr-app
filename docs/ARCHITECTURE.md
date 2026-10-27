# Operatr architecture — POC baseline

Operatr is a private BYOK agent workspace for strategic research and operational work. The target is a focused proof of concept: secure enough for private testing and real credentials, without unnecessary enterprise systems.

## Current boundary

The current front end is a Next.js application with prototype views for authentication, onboarding, provider selection, integrations, dashboard telemetry, and the agent workspace. Until Phase 1, it makes no live provider or tool calls.

```text
Browser UI -> authenticated Next.js route handler -> server runtime -> approved provider or tool
                                                    -> Supabase (RLS-scoped data)
```

The browser must never call an LLM, Tavily, Apify, or Google API with a user credential.

## Module contract

- `src/app/api/**`: HTTP handlers; validate input and return the shared response envelope.
- `src/lib/server/**`: server-only business logic, provider adapters, credential handling, and external clients.
- `src/lib/browser/**`: explicitly non-sensitive browser preferences only.
- `src/lib/**`: shared, credential-free utilities.

## Implementation order

1. Foundation: conventions, environment template, feature flags, quality checks, and browser-key removal.
2. Identity and vault: Supabase Auth, middleware, RLS, and encrypted credential storage.
3. Chat: provider-neutral streaming chat, persisted conversations, and the four supported LLM providers.
4. Operatr runtime: response modes, model policy, safe retry/fallback behavior, and execution telemetry.
5. Tools: Tavily, a constrained Apify allowlist, then Google OAuth integrations.

## POC rules

- BYOK credentials are accepted by server routes only and never stored in browser storage, source control, logs, or analytics.
- Provider and tool features are off by default behind server environment flags.
- Every user-owned database record will be Supabase RLS scoped before application access.
- Tool output is untrusted input; it cannot alter policy or cause an external action without explicit user approval.
- Cross-provider fallback requires user opt-in because it changes the recipient of a prompt.
