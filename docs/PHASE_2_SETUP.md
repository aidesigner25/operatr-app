# Phase 2 setup — streaming chat runtime

## 1. Apply the chat migration

Run [`supabase/migrations/202610280002_phase2_chat_runtime.sql`](../supabase/migrations/202610280002_phase2_chat_runtime.sql) in the Supabase SQL editor. It creates private `chat_conversations` and `chat_messages` tables and enables row-level security before application access.

## 2. Enable chat deliberately

Keep this disabled during deployment and set it only after the migration has completed:

```bash
OPERATR_ENABLE_CHAT=true
```

Restart the Next.js server after changing the environment. The provider and tool flags remain unchanged: Tavily, Apify, Google Workspace, uploads, background agents, and cross-provider fallback are not part of Phase 2.

## 3. Smoke test one provider at a time

1. Sign in as a test user with only one LLM key connected.
2. Open **Agent workspace** or the dashboard chat, choose that provider/model, and send a short prompt.
3. Confirm text streams into the response, a short subject title appears in history, and the conversation remains after refresh or when opened from the other chat surface.
4. Press **Stop** during a longer response; a partial response, if produced, should remain in that user’s conversation only.
5. Sign in as the second test user and confirm neither conversation titles nor messages from the first user appear.

The available model menu is deliberately curated. Use **Custom model ID** only when your account has access to a provider model that is not listed; Operatr forwards that ID as-is to the provider and does not discover models automatically.
