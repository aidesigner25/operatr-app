# Operatr architecture — POC baseline

Operatr is a private BYOK agent workspace for strategic research and operational work. The target is a focused proof of concept: secure enough for private testing and real credentials, without unnecessary enterprise systems.

## Current boundary

The current front end is a Next.js application with Supabase email/password authentication, protected workspace routes, a preference-only onboarding flow, an encrypted BYOK vault, a server-side streaming chat runtime, and opt-in Tavily and Apify research. Chat and research remain disabled until explicitly enabled with server environment flags; OAuth integrations are not live.

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

## Phase 1 identity and vault

- `src/proxy.ts` protects workspace and vault routes. It verifies the Supabase access token and renews it with a refresh token when needed.
- Supabase session tokens are held in `HttpOnly`, `SameSite=Lax` cookies. Prototype browser-auth markers are removed on the auth screen.
- The browser can only submit a credential to `/api/vault/credentials/[provider]`. The route validates its shape, authenticates the owner, encrypts it with AES-256-GCM, then writes the ciphertext using that user's Supabase JWT.
- The encryption AAD includes the user ID and provider. A credential cannot be replayed under another owner or provider without failing decryption.
- Vault status routes return provider metadata and the final four characters only—never a credential value or ciphertext.
- `supabase/migrations/202610280001_phase1_identity_vault.sql` creates profiles, vault tables, audit metadata, and owner-only RLS policies.

## Phase 2 chat runtime

- `supabase/migrations/202610280002_phase2_chat_runtime.sql` creates owner-scoped conversations and messages with RLS policies that also verify a message belongs to an owned conversation.
- `/api/chat/**` is protected both by the route proxy and by server-side Supabase session verification.
- A chat request decrypts only the signed-in user's selected provider credential in server memory. Browser responses contain conversation data and streamed model text, never the credential or ciphertext.
- After the first completed exchange, Operatr attempts a short title using the selected provider, with a six-second limit and a local fallback if the provider is unavailable. The title call shares the opening message with that provider, may use additional tokens, and never changes providers. Users can rename their own conversations through the protected conversation endpoint.
- The dashboard composer and Agent workspace use the same persisted conversation API; the dashboard does not simulate tools, task runs, or value calculations.
- OpenAI, Anthropic, Google Gemini, xAI, and OpenRouter run behind a common streaming interface. OpenRouter is explicit BYOK selection only; free-model availability and provider-specific data terms remain the user's responsibility. Provider fallback, file uploads, model discovery, and background agents are not part of this phase.
- Gemini 3.8 Flash runs with server-enforced low thinking to preserve the interactive runtime budget. Response effort still controls Operatr's output cap; this setting does not expose hidden reasoning.
- `OPERATR_ENABLE_CHAT` remains `false` by default. It must be deliberately enabled only after the migration and a provider smoke test.

## Phase 3 agent runtime

- Each chat message creates an owner-scoped run record and a concise execution trace. These capture operational metadata only: selected provider/model, response mode, bounded character/token budgets, retry count, and terminal status. They do not store credentials, hidden reasoning, or raw provider payloads.
- Conversation context is bounded to the newest 36,000 characters. Response modes use server-enforced output caps: Concise 800 tokens, Standard 2,000, and Deep 4,000.
- A run has a 90-second server-side deadline. The user can still stop a request from the workspace; partial text, if any, is saved as cancelled.
- A transient provider failure may retry exactly once only before any text is streamed. The retry uses the exact same provider and model. There is no automatic model or cross-provider fallback.
- The workspace shows a high-level execution state—such as preparing, generating, retrying, and saving—rather than hidden model reasoning.
- Operator identity and preferences live in the existing owner-scoped `profiles` table: display name, organization, avatar selection/custom bounded image, hourly rate, business goals, writing sample, and directives. Email remains an Auth concern and is changed only through the server-side Supabase Auth user endpoint.
- Users may explicitly change provider, model, and response effort on an existing conversation. The persisted choice takes effect on its next request; no automatic provider transition occurs.

## Phase 4 research tools

- Tavily is disabled unless `OPERATR_ENABLE_TAVILY=true`. A user must explicitly enable **Live web** on an individual message; Operatr then runs one server-side Tavily Basic search using that user's encrypted Tavily key.
- Requests use a fixed, low-cost schema: up to five results and one bounded excerpt per result; raw pages, Tavily's generated answer, images, arbitrary domain controls, and browser-provided tool parameters are excluded.
- The web request has a 15-second deadline and per-user rate limit. Result excerpts remain untrusted input and are placed in a bounded, injection-resistant provider context. Only user-visible source links can be retained in the chat answer; telemetry never holds source payloads or credentials.
- Apify is disabled unless `OPERATR_ENABLE_APIFY=true`. A user explicitly enables it for an individual response; a server-side task router chooses an allowlisted task from the current prompt and derives fixed inputs. A named company can resolve through the LinkedIn company Actor; a site-research request may use one discovery search per company, up to three, before the bounded crawl.
- The initial allowlist is: Website Content Crawler for public competitor pages, bounded Web Search for site discovery, Reddit Scraper for buyer-signal questions, eiv LinkedIn Posts Scraper for direct public company/profile/post URLs, and eiv LinkedIn Company Scraper for a named company or website domain. There are no arbitrary actor IDs, user-supplied actor options, cookies, X scraping, or open-ended crawling.
- Every Apify run has an 80-second server-side Actor cap, but Operatr waits only 45 seconds before retrieving any available dataset items and preserving time for the model response. It requests cancellation of runs still active after that window, with the Actor cap as a backstop. Multi-site exact-page comparisons use HTTP crawling for speed; JavaScript-only pages may require a single-page retry. Fixed item and USD charge ceilings, bounded normalized evidence, and a per-user rate limit of five runs per ten minutes still apply. Raw actor payloads and credentials are never written to telemetry.

## Implementation order

1. Foundation: conventions, environment template, feature flags, quality checks, and browser-key removal.
2. Identity and vault: Supabase Auth, middleware, RLS, and encrypted credential storage. **Complete in code; environment and migration setup required.**
3. Chat: provider-neutral streaming chat, persisted conversations, and the supported BYOK LLM providers. **Complete in code; migration and explicit feature enablement required.**
4. Operatr runtime: response modes, model policy, safe retry/fallback behavior, and execution telemetry. **Complete in code; migration and smoke test required.**
5. Tools: Tavily and the constrained Apify allowlist **complete in code; setup and smoke test required**, then Google OAuth integrations.

## POC rules

- BYOK credentials are accepted by server routes only and never stored in browser storage, source control, logs, or analytics.
- Provider and tool features are off by default behind server environment flags.
- Every user-owned database record will be Supabase RLS scoped before application access.
- Tool output is untrusted input; it cannot alter policy or cause an external action without explicit user approval.
- Cross-provider fallback requires user opt-in because it changes the recipient of a prompt.
