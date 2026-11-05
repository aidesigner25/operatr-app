# Phase 5: workspace integrations and core workflows

The original MVP plan describes an ambitious final runtime phase. Earlier phases already delivered multi-provider chat, streamed execution states, and bounded Tavily/Apify research. This plan identifies the remaining work without implying that any incomplete feature is live.

## Workstreams

1. **Google Workspace:** Add an authenticated, server-side OAuth connection with encrypted, user-scoped credentials; connection status and disconnect; and bounded Google Docs and Sheets creation/export. Explicit user action must authorize each write. Decide and document the minimum scopes, token refresh/revocation behavior, failure handling, and test-user setup before enabling the feature. Google Gemini API keys are separate from Google Workspace OAuth.
2. **File input:** Add bounded, authenticated chat uploads and parsing with clear supported formats, size limits, error messages, and disclosure that extracted content goes to the selected model provider. Treat uploaded content as untrusted. Define retention and deletion behavior before storing files.
3. **Value telemetry:** Model-generated assessments, user edits, per-response rate snapshots, and dashboard totals/monthly chart are implemented; database migration and live isolation testing remain. Assessments are estimates, not verified time.
4. **Runtime and polish:** Verify streamed activity across research and new export operations. Review fallback routing separately: the current deliberate no-cross-provider-fallback rule protects against sharing prompts with an unselected provider; any fallback must require informed opt-in.
5. **End-to-end validation:** Test isolation with two users, cancellation and failures, OAuth reconnect/disconnect, creation results, uploads, and dashboard behavior. Keep new integrations disabled until setup and smoke tests pass.

## Initial progress

- Removed sample dashboard statistics that were presented as actual activity. Estimated hours and value now show as unavailable until an estimation method exists.
- Recent work reads the signed-in user's latest completed agent runs under the existing row-level security policies. A completed run describes runtime status, not proof of task success or time saved.
- Google OAuth and explicit exports of saved responses to new Docs and Sheets are implemented behind the Workspace feature flag. Docs use formatted HTML conversion to preserve headings, text styles, and editable tables; Sheets style headings and tables and write literal cells. Live Docs and Sheets creation has been smoke tested; reconnect and disconnect still require smoke tests; edits or appends to existing files are not implemented.

- Google Docs formatting and initial TXT/CSV attachment flows passed user smoke tests.
- Chat supports one UTF-8 TXT, MD, CSV, JSON, or text-based PDF attachment per message. Text files are limited to 64 KB; PDFs to 2 MB, 25 pages, and 20,000 extracted characters (64 KB UTF-8). The extracted text and filename are stored as part of the owner-scoped conversation message and sent to the selected model within the bounded recent context. Research tools receive the question, not the attachment. File data is untrusted. Known injection patterns are rejected and document text is isolated as data, but these protections cannot guarantee detection of every attack. PDFs with detected JavaScript or embedded files are rejected; OCR, DOCX, and image uploads remain future work. PDF parsing uses a timed worker with a bounded V8 heap, not an OS-level sandbox.

## Google setup for a live test

A Google Cloud project, an OAuth consent configuration, a web application OAuth client, an exact redirect URI for the running app, and enabled APIs will be needed. The implementation will define exact scopes and redirect settings before setup instructions are finalized. Never paste client secrets or user tokens into chat or commit them to the repository.
