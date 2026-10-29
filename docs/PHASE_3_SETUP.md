# Phase 3 setup — bounded agent runtime

## 1. Apply the runtime migration

Run these migrations in order in the Supabase SQL editor before testing this branch:

1. [`202610290001_phase3_agent_runtime.sql`](../supabase/migrations/202610290001_phase3_agent_runtime.sql) adds private agent-run telemetry and trace events.
2. [`202610290002_profile_preferences.sql`](../supabase/migrations/202610290002_profile_preferences.sql) adds owner-scoped profile identity, avatar, operating-rate, and persona-preference fields.

The agent runtime migration adds two owner-scoped tables:

- `chat_agent_runs` — a private record of the selected provider/model, response mode, bounded input/output size, retry count, and terminal run state.
- `chat_agent_run_events` — a private, high-level execution trace such as preparing, generating, retrying, and saving.

The migration intentionally does not store credentials, raw provider payloads, hidden reasoning, or tool output.

## 2. Feature flag

No new environment variable is needed. This runtime is part of chat, so it uses the existing setting:

```bash
OPERATR_ENABLE_CHAT=true
```

Apply the migration before enabling or deploying this branch. Existing chat flags for Tavily, Apify, and Google Workspace stay disabled.

## 3. Run policy

Every request remains with the provider and model selected for the conversation.

| Guardrail | Policy |
|---|---|
| Context | Most recent messages only, capped at 36,000 characters before the provider call |
| Output | Concise: 800 tokens; Standard: 2,000; Deep: 4,000 |
| Time | Server-side 90-second maximum per run |
| Retry | At most once, only for a transient failure before any response text is streamed |
| Fallback | No automatic model or provider fallback; cross-provider sharing requires an explicit user choice in a new conversation |
| Trace | High-level execution status only; no hidden reasoning or credential/provider payloads |

## 4. Smoke test

1. With one connected provider, send a normal prompt and confirm the in-chat status progresses from preparing to generating, then the response and run record complete.
2. Select each response mode in a new conversation and confirm the composer labels show its output cap.
3. Press **Stop** during a long response. The partial response, when present, should remain private to that conversation and its run should be marked cancelled.
4. Cause a temporary provider-side failure before output begins, if safely possible. Confirm there is at most one retry and the model/provider label does not change.
5. In Supabase, verify the signed-in user can see only their own rows in `chat_agent_runs` and `chat_agent_run_events`.

Tools, uploads, web access, background jobs, autonomous actions, and automatic cross-provider fallback are still out of scope.

## 5. Profile and conversation controls

- The **Profile** page saves display name, organization, an optional bounded custom image, and a selected studio avatar. Email updates are sent through Supabase Auth and may require inbox confirmation depending on your Auth policy.
- The **Settings** page saves rate, goals, writing sample, and directives into the same owner-only profile record. The dashboard reads the saved hourly rate when calculating capital equivalent.
- Provider, model, and response effort can be switched inside an existing chat. The selected values are persisted for that conversation and apply to its **next** response only. Changing provider is an explicit user choice; Operatr never switches a provider automatically.
- **Purge stored keys** displays a final confirmation dialog before calling the authenticated vault deletion route. A successful result reports the number of encrypted credentials removed.
