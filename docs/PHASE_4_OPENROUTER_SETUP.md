# Phase 4 setup — OpenRouter free models

OpenRouter is an optional BYOK model provider. It uses OpenRouter's OpenAI-compatible streaming endpoint and is intended here as a free-tier testing path, not as an automatic fallback.

## 1. Apply the migration

Run this in Supabase SQL Editor before saving an OpenRouter key:

```sql
-- supabase/migrations/202611030001_phase4_openrouter.sql
```

The migration adds `openrouter` to the existing database allowlists. It does not modify RLS policies or stored credentials.

## 2. Connect a key

Create an OpenRouter API key, then save it at **Integrations → OpenRouter API Key**. The key is encrypted per user in the same vault as the other BYOK providers.

## 3. Choose a model

The chat provider menu offers these free starting choices:

| Model | Intended use |
|---|---|
| Nemotron 3.5 Lightning | Fast, lightweight chat and first Apify smoke tests. |
| Nemotron 3.5 Super VL | Higher-capability research synthesis. |
| Nemotron 3 Ultra | More involved strategic work; free capacity can be less predictable. |
| OpenRouter free router | Lets OpenRouter select an available free text model. |

Free capacity is rate-limited and availability can vary. Operatr never silently moves a prompt to another provider; select OpenRouter and the desired model explicitly for the next response.

## Privacy note

Use only non-sensitive test prompts with OpenRouter free models. OpenRouter describes free endpoints as rate-limited, and individual free-model pages may have provider-specific data-use terms. Treat the selected external provider as a recipient of the prompt, just as with any BYOK LLM.

## 4. Smoke test

1. Apply the migration, then save an OpenRouter key in **Integrations**.
2. In an existing chat, select **OpenRouter → Nemotron 3.5 Lightning · free**.
3. Send a normal short prompt, then an Apify-enabled pricing prompt.
4. Confirm streaming begins and the selected provider/model are retained in the conversation header.
