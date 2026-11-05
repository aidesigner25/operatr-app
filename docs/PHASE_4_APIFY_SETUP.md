# Phase 4 setup — Apify research allowlist

Apify is an explicit, per-response research option. It is not a general scraping interface: the browser offers one **Apify research** toggle, while Operatr's server-side task router chooses the suitable allowlisted actor and owns its input shape, timeout, output normalization, and spend ceiling.

## 1. Connect an Apify API token

Create an Apify API token, then sign in to Operatr and save it under **Integrations → Apify API Token**. The browser submits the token only to Operatr's authenticated vault route. It is encrypted per user and never returned to the browser.

## 2. Enable the server feature

Add this to the local or deployed server environment, then restart the app:

```bash
OPERATR_ENABLE_APIFY=true
```

Leave the flag off in shared environments until the smoke test passes. No other environment variable or database migration is required.

## 3. Initial task allowlist

| Automatic route | Server-owned actor | Prompt signal | Run cap |
|---|---|---|---|
| Competitor site | `apify/web-search` (up to five candidates per company) → `apify/website-content-crawler` | One to three public non-LinkedIn URLs, or up to three named companies plus a pricing/product/security/docs-style question | One discovery search per named company, then a single crawl with the existing 4-page/$0.25/80-second limits. |
| Reddit buyer signal | `batscrape/reddit-scraper` for keywords; `apify/reddit-scraper` for direct Reddit URLs or communities | Explicit Reddit requests or questions about user opinions, reviews, complaints, and experiences | Keyword search: one query, up to 10 posts, $0.03 run ceiling; direct targets: 20 dataset items, $0.15 ceiling. Both have 80-second Actor caps. |
| LinkedIn posts — direct | `eiv/linkedin-posts-scraper` | One to three public LinkedIn profile, company, or post URLs | 25 items, $0.10, 80 seconds |
| LinkedIn company — named | `eiv/linkedin-company-scraper` | A named company plus LinkedIn activity/posts language | One company, five latest public posts, no employee data, $0.02, 80 seconds |

The **Apify research** toggle is off by default. When enabled, Operatr reevaluates the current message and runs at most one automatically selected research task for that response; it can be used alongside the separate Tavily **Live web** option. A named site-research request may search for up to five candidate pages for each named company, up to three searches, then uses the same tightly scoped crawler. The discovery filter requires a matching company-name domain label, but this is a heuristic and does not prove ownership; it can miss legitimate domains. Each successful discovery search can incur its own charge. A named LinkedIn request uses the company actor directly. An unclear prompt does not trigger discovery or a broad scrape.

For site research, an exact target page is the fastest and most reliable input: for example, `https://tavily.com/pricing` is crawled by itself. When a user provides a homepage and a clear intent such as pricing, security, integrations, or documentation, Operatr crawls the homepage plus only direct links whose paths match that intent. It deliberately does not crawl an arbitrary site section from a bare domain.

## 4. Guardrails

| Guardrail | Policy |
|---|---|
| Actor control | Actor IDs and input fields are server-owned. The browser cannot invoke an arbitrary actor or submit custom actor options. Site discovery examines at most five results per company and cannot become general-purpose search. |
| Target safety | Site and LinkedIn tasks accept only public HTTPS URLs; localhost, private IPv4 ranges, credentials in URLs, and `.local` hosts are rejected. |
| Cost and time | Every run applies fixed item and USD ceilings with an 80-second Actor cap. Operatr waits 45 seconds, reads available partial results, and requests cancellation if the Actor is still running; the Actor timeout is a backstop if cancellation fails. Operatr gives the model a separate 120-second response window after research, subject to a 190-second overall run backstop. |
| Multi-site comparisons | Up to three targeted pages use the faster HTTP crawler to reduce browser startup time. JavaScript-only pages may return incomplete content; use a single exact page to retry with browser rendering. |
| Rate | Five Apify runs per user per ten minutes in this POC process. |
| Free accounts | The low per-run ceilings make the user-visible opt-in viable for free-credit testing; the user still controls their Apify account and spending limits. |
| Scope | No cookies, logins, X actors, arbitrary actor IDs, open-ended crawling, scheduled jobs, or background result delivery. LinkedIn uses only data available to logged-out visitors. |
| Data | Credentials and raw actor payloads are not retained in telemetry. Operatr sends only bounded normalized excerpts to the selected model as untrusted reference material. |

## 5. Smoke test

1. Connect an LLM key and an Apify API token, enable `OPERATR_ENABLE_APIFY=true`, and restart the app.
2. In either chat composer, turn on **Apify research**. For the fastest page-specific run, send: `Summarize pricing evidence on https://tavily.com/pricing.`
3. Repeat with a homepage and intent: `Summarize pricing evidence on https://tavily.com.` Confirm the trace reports a competitor-site task and returns only the homepage plus matching pricing-style links.
4. Confirm the run state reports the automatically selected Apify task, then a result count before generation. Confirm the answer distinguishes evidence from inference and links source claims where possible.
5. Leave **Apify research** on and ask: `What frustrations do small teams report about consolidating customer research tools?` Confirm Operatr selects Reddit.
6. Ask: `What has Tavily been posting about on LinkedIn recently?` Confirm Operatr selects the named-company LinkedIn path, returns up to five public posts, and summarizes those supplied excerpts rather than claiming it lacks LinkedIn access. Repeat with a direct post or company URL to confirm the direct LinkedIn path remains available.
7. Ask: `Get OpenAI pricing information and unpack its monetization strategy.` Confirm Operatr performs only one official-result lookup and then crawls the discovered target with the existing page cap. Repeat with `https://tavily.com/pricing` to confirm the exact-page path does not need discovery.
8. Disconnect the Apify token or use a test account without it; confirm Operatr asks the user to connect it and no Apify run starts.
9. In Supabase, verify run events contain concise lifecycle labels only—not the API token, raw actor output, or complete provider payloads.

## Deliberately deferred

Actor expansion waits for evidence that a task needs it. Any later actor must preserve this contract: one explicit task, a server-controlled actor and input schema, bounded normalized output, a user-visible cost ceiling, rate limit, deadline, and a free-account-safe test path.
