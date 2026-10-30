# Phase 4 setup — Tavily live research

Phase 4 adds a deliberately narrow first research tool. It is available only when the user explicitly enables **Live web** on the individual response they are about to send.

## 1. Connect a Tavily key

Create a Tavily API key, then sign in to Operatr and save it under **Integrations → Tavily Search API Key**. The browser sends the key only to Operatr's authenticated vault route; it is encrypted per user and is never returned to the browser.

## 2. Enable the server feature

Add this to the local or deployed server environment, then restart the app:

```bash
OPERATR_ENABLE_TAVILY=true
```

Keep the feature disabled in any shared environment until the smoke test has passed. `OPERATR_ENABLE_APIFY` remains off for the next, allowlist-based part of Phase 4.

## 3. Guardrails

| Guardrail | Policy |
|---|---|
| User control | Live web is off by default and must be selected for each response. |
| Request shape | One search per opted-in response; the server accepts no browser-supplied tool options. |
| Cost profile | Tavily `basic` depth, up to five results, one snippet per result; no raw pages, generated Tavily answer, or images. |
| Rate | Eight searches per user per ten minutes in this POC process. |
| Time | A Tavily request has a 15-second deadline within the existing 90-second run cap. |
| Safety | Source excerpts are bounded, treated as untrusted data, and cannot override Operatr's instructions. |
| Data | Credentials, raw tool payloads, and excerpts are not written to telemetry. The model may include user-visible source links in its saved answer. |

Tavily documents `basic` search as one API credit. The explicit per-message control keeps consumption clear for users testing on a free plan.

## 4. Smoke test

1. With a connected LLM key and Tavily key, enable **Live web** in either chat composer.
2. Ask a current research question, such as: `What changed in the latest [company] pricing announcement? Cite the sources.`
3. Confirm the run state displays **Searching live web with Tavily**, then reports the source count before generation.
4. Confirm the response includes Markdown links for material web claims.
5. Turn **Live web** off and repeat with a normal prompt. No Tavily request should occur.
6. In Supabase, check that the run events contain only concise lifecycle labels—not credentials, result excerpts, or complete provider payloads.

## Deferred Apify scope

Apify stays disabled until Operatr has a short, task-specific actor allowlist. The actor layer will use the same explicit per-response permission, strict input schemas, run/cost limits, normalized bounded results, and a server-side kill switch. It will never accept arbitrary actor IDs from the browser.
