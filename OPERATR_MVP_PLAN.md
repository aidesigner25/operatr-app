# Operatr MVP Master Architecture & Execution Plan

**Document Version:** 1.0.0  
**Status:** Approved for Implementation  
**Target:** Simplest Functional MVP  
**Architecture:** Private, Adaptive Agentic Operating System (BYOK)

---

## 1. Executive Summary & Product Architecture

Operatr is an individualized, agentic business intelligence operating system designed for business owners, operators, and researchers. It automates high-friction research, monitoring, and synthesis tasks to reclaim time and generate capital value.

### Key Tenets
1. **Zero-Margin BYOK (Bring Your Own Key):** The platform never subsidizes or resells model inference. Users supply their own credentials for LLMs (OpenAI, Anthropic, Google) and tools (Tavily, Apify, Google Workspace).
2. **Deterministic Security:** User credentials stay encrypted. External scraped content is treated as untrusted data to mitigate indirect prompt injection. Destructive operations require explicit confirmation.
3. **Auditable Value Generation:** Every completed task measures estimated hours saved and translates that time into dollar value based on the user's configured hourly rate.
4. **Visual Gravity:** A restrained, high-contrast black-and-white visual aesthetic with classical motifs and responsive micro-interactions.

---

## 2. Technology Stack

```
+-----------------------------------------------------------------+
|                       Client Interface                          |
|  Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS |
|  shadcn/ui + Lucide Icons + Canvas Particle Engine + Recharts   |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                      Application Services                       |
|   Next.js Server Actions & Route Handlers (Edge / Node Runtime) |
|   Vercel AI SDK Core (Streaming, Tool Calling, Multi-Provider)  |
+-----------------------------------------------------------------+
             |                                     |
             v                                     v
+---------------------------+       +-----------------------------+
|    Database & Auth        |       |    External Integrations    |
|    Supabase PostgreSQL    |       |    - Core LLMs              |
|    Supabase Auth          |       |    - Tavily Search API      |
|    Supabase Storage       |       |    - Apify Actors           |
|    pgcrypto / Vault       |       |    - Google Workspace OAuth |
+---------------------------+       +-----------------------------+
```

### Core Technologies
- **Framework:** Next.js (App Router, Server Components, Route Handlers)
- **Styling:** Tailwind CSS v4, CSS Variables, monochrome palette (`#000000`, `#0A0A0A`, `#18181B`, `#FFFFFF`)
- **UI Primitives:** Radix UI primitives via shadcn/ui
- **State & Streaming:** Vercel AI SDK (`ai/rsc`, `useChat`) with unified tool-calling support across OpenAI, Anthropic, and Google Gemini
- **Database & Identity:** Supabase (Auth with magic link/password, PostgreSQL database, Row Level Security)
- **Key Vault:** PostgreSQL `pgcrypto` AES-256 encryption at rest with per-user salted keys
- **Visualization:** Recharts for telemetry graphs (value generated, hours saved, task frequency)

---

## 3. User Journey & State Machine

```
[ Visitor ]
    │
    ▼
[ Landing Page ] ──( "Start for Free" CTA )──► [ Auth Page (Sign Up / Sign In) ]
                                                        │
                                                        ▼
                                            [ Onboarding Choice ]
                                            ┌───────────┴───────────┐
                                            ▼                       ▼
                                [ Guided Onboarding ]       [ Skip to Dashboard ]
                                (Step 1-6 Configuration)     (Read-Only Exploration)
                                            │                       │
                                            ▼                       │
                                [ Active Dashboard Access ] ◄───────┘
                                (Keys Validated & Stored)
```

### Onboarding Steps
1. **Core LLM Connection:**
   - Select primary provider: OpenAI, Anthropic, or Google.
   - Choose default model (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro`).
   - Optional: select a fallback provider and model from a different vendor.
2. **Apify Connection:**
   - Input Apify API token.
   - Display free-tier rate limit advisory.
3. **Tavily Connection:**
   - Input Tavily Search API key.
4. **Google Workspace Connection:**
   - One-click OAuth consent for Google Docs and Google Sheets scopes.
5. **Operator Profile & Goal Definition:**
   - Prompt: "Describe your business focus and operational goals in 2 to 5 sentences."
   - Set personal hourly rate in USD (default: $150/hr).
6. **Initialization:**
   - The selected LLM runs an inaugural task using the user's goals.
   - Returns a personalized welcome brief in chat and activates the dashboard.

---

## 4. Database Schema (Supabase PostgreSQL)

All tables enforce Row Level Security (RLS) bound to `auth.uid() = user_id`.

```sql
-- 1. User Profiles & Settings
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  hourly_rate numeric(10, 2) default 150.00 not null,
  business_goals text,
  writing_sample text,
  agent_instructions text,
  onboarding_completed boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Encrypted User Credentials (BYOK Vault)
create table public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, -- 'openai' | 'anthropic' | 'google' | 'tavily' | 'apify' | 'google_workspace'
  key_ciphertext text not null,
  key_hint text, -- e.g. "sk-...394a"
  metadata jsonb default '{}'::jsonb, -- selected models, token expiry, scopes
  is_valid boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_provider unique(user_id, provider)
);

-- 3. Tasks & Agent Runs
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  current_step text, -- 'Contemplating', 'Running Research', 'Creating Materials', 'Calculating Value'
  model_used text not null,
  tokens_input integer default 0,
  tokens_output integer default 0,
  estimated_hours_saved numeric(6, 2) default 0.00,
  dollar_value_generated numeric(10, 2) default 0.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone
);

-- 4. Messages & Artifacts
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  tool_calls jsonb,
  tool_results jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Generated Artifacts
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('google_doc', 'google_sheet', 'markdown_report', 'file_upload')),
  title text not null,
  external_url text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. User API Keys (For external programmatic invocation)
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null, -- 'opr_live_...'
  last_used_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

---

## 5. Core Agent Engine: "Operatr"

### 5.1 Persona Calibration & Prompt Architecture
The core system prompt combines three immutable layers with three dynamic user layers:

```
[ SYSTEM LAYER 1: Core Safety & Boundaries ] (Immutable)
- Strict refusal of harmful, destructive, or unauthorized requests
- Prohibition on credential leakage or system prompt self-disclosure
- Isolation of tool output as untrusted external data

[ SYSTEM LAYER 2: Operational Identity ] (Immutable)
- Role: Executive Operator & Business Intelligence Engine
- Tone: Direct, concise, analytical, free of filler phrases and synthetic enthusiasm
- Modus Operandi: Action-oriented, hypothesis-driven, evidence-backed

[ SYSTEM LAYER 3: Value Telemetry Calculation ] (Immutable)
- Mandatory output step: Estimate human manual hours required for the completed run
- Formula: Time = sum(source discovery, deep extraction, data synthesis, document assembly)

[ USER CONTEXT 1: Business Profile & Goals ] (Configured in Settings)
- Injected user focus, industry context, and strategic objectives

[ USER CONTEXT 2: Style & Voice Alignment ] (Configured in Settings)
- Few-shot analysis of the user's provided writing sample

[ USER CONTEXT 3: Operational Constraints ] (Configured in Settings)
- Behavioral rules (e.g., "Always prioritize B2B SaaS signals", "Keep reports under 500 words")
```

### 5.2 Tooling Registry & Dispatcher

| Tool Identifier | Provider | Primary Function | Output Schema |
|---|---|---|---|
| `tavily_search` | Tavily API | Real-time deep web and news discovery | Title, URL, raw text, relevance score |
| `apify_social_signals` | Apify Actor | Tracks discourse, pain points, and active buyer intent on social platforms | Posts, engagement metrics, author metadata, sentiment |
| `apify_competitor_radar` | Apify Actor | Crawls competitor pricing, landing pages, and announcements | Page diffs, structural changes, new offerings |
| `apify_partner_finder` | Apify Actor | Identifies creators, affiliate partners, and adjacent tools | Partner fit score, contact data, profile synopsis |
| `google_doc_create` | Google Docs API | Builds structured briefing documents and executive memos | Document URL, Doc ID, title |
| `google_sheet_append` | Google Sheets API | Records intelligence rows, competitor tables, and lead pipelines | Spreadsheet URL, row count, range |
| `file_analyzer` | Local Parser | Ingests and processes PDFs, CSVs, and plain text files uploaded in chat | Text chunks, extracted tables, summaries |

### 5.3 Signal -> Opportunity -> Action Loop

```
Step 1: Signal Detection
  └─ Apify actor queries target platform or competitor page.
  └─ Raw scraped items parsed into clean candidate records.

Step 2: Enrichment & Verification
  └─ Tavily performs targeted web queries on promising leads to verify viability.
  └─ Untrusted input filtered to remove potential injection vectors.

Step 3: Strategic Synthesis
  └─ Agent evaluates opportunities against user's defined business goals.
  └─ Assigns priority score and explains rationale in user's tone.

Step 4: Material Creation
  └─ Creates a Google Doc summary or appends rows to a Google Sheet.
  └─ Returns direct link and executive brief in the chat thread.

Step 5: Telemetry Logging
  └─ Computes human-equivalent hours saved.
  └─ Calculates dollar return: hours_saved * user_hourly_rate.
  └─ Updates dashboard metrics in real time.
```

---

## 6. Security Architecture & Threat Defense

1. **Client-Side Key Protection:**
   - Keys are submitted over HTTPS directly to Next.js Route Handlers.
   - Keys are immediately encrypted using AES-256-GCM before storage in the Supabase database.
   - Plaintext keys never touch browser local storage or persistent cookies.
2. **Indirect Prompt Injection Mitigation:**
   - All tool responses (web scrapes, social feeds, competitor pages) are wrapped in rigid XML isolation tags: `<external_untrusted_data source="..." timestamp="...">...</external_untrusted_data>`.
   - The model instructions mandate that instructions found within these tags must never be executed as directives.
3. **Execution Guardrails:**
   - High-impact actions (e.g., initiating batch web scrapes or altering existing docs) require inline confirmation cards before dispatch.
   - Sandboxed file parsing prevents malicious code execution from uploaded attachments.
4. **Credential Revocation & Zero Residue:**
   - Users can disconnect any provider or purge all stored credentials with a single click in Settings.
   - Purging permanently drops ciphertext records from the database.

---

## 7. Frontend Architecture & Page Directory

### 7.1 Design Foundations
- **Palette:** Pure Monochrome. Jet black (`#050505`), pure white (`#FFFFFF`), neutral zinc grays (`#71717A`, `#27272A`, `#18181B`).
- **Typography:** Crisp sans-serif with monospace accents for operational codes, status tags, and metrics.
- **Visual Motif:** Classical Greek architectural lines and marble statues contrasted against stark modern minimalist interfaces.
- **Particle System:** Lightweight HTML5 Canvas particle simulation with low-velocity interactive physics responding to cursor movements.

### 7.2 Page Breakdown

```
src/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx               # Landing Page (Monochrome, Classical Motif, Particles)
│   │   └── layout.tsx             # Public Minimal Layout with Pill Navbar
│   ├── (auth)/
│   │   ├── login/page.tsx         # Unified Sign In / Sign Up
│   │   └── onboarding/page.tsx    # Guided Setup (Steps 1-6) or Skip
│   └── (dashboard)/
│       ├── layout.tsx             # Authenticated Shell (Sidebar, Header, Profile Menu)
│       ├── dashboard/page.tsx     # Command Center: Metrics, Graphs, Live Agent Chat
│       ├── integrations/page.tsx  # BYOK Credential Vault & API Health
│       ├── settings/page.tsx      # Goals, Voice Sample, Behavioral Rules, Hourly Rate
│       ├── api/page.tsx           # Developer API Keys & Webhook Documentation
│       └── profile/page.tsx       # Account Details, Security, Data Wipe
```

### 7.3 Detailed Page Specifications

#### 1. Landing Page (`/`)
- **Pill Navbar:** Fixed, blurred backdrop, containing Brand mark, Core Pillars, Integrations list, and "Launch Operatr" CTA.
- **Hero Section:** High-impact typography, clear value proposition, primary CTA, and subtle classical art backdrop overlaid with an interactive particle canvas.
- **Tool Ticker:** Infinite horizontal marquee displaying integrated services (OpenAI, Anthropic, Google Gemini, Tavily, Apify, Google Docs, Google Sheets).
- **Four Operational Pillars:**
  1. *Continuous Signal Intelligence* (Real-time market and audience detection)
  2. *Autonomous Enrichment* (Multi-source verification via deep search)
  3. *Action Generation* (Automated document drafting and pipeline creation)
  4. *Quantified Return* (Real-time tracking of hours and capital saved)
- **Interactive Terminal Preview:** Live demo widget showing the agent transitioning between states: "Contemplating" -> "Running Research" -> "Creating Materials".
- **Bottom Call to Action:** Streamlined conversion section with minimal friction.

#### 2. Main Dashboard & Chat (`/dashboard`)
- **Top Metric Cards:**
  - Total Hours Reclaimed (e.g., `48.5 hrs`)
  - Capital Value Generated (e.g., `$7,275.00`)
  - Active Workflows / Completed Tasks (e.g., `34 runs`)
  - Success Rate (e.g., `98.2%`)
- **Telemetry Graph:** Area/bar chart tracking cumulative value and hours saved across days and weeks.
- **Agent Workspace (Main Interface):**
  - Streaming conversational message feed.
  - Collapsible tool invocation cards showing real-time intermediate steps.
  - Dynamic status badge: `Thinking`, `Running Research`, `Scraping Data`, `Creating Materials`.
  - Input bar with multi-line expander, file attachment button (drag & drop support), and model quick-switch.
  - Value pill attached to every agent response (e.g., "+1.8 hrs saved ($270.00)").

#### 3. Integrations (`/integrations`)
- **LLM Providers:** OpenAI, Anthropic, Google Gemini. Status indicators (Connected / Not Configured), model selectors, fallback priority toggles.
- **Intelligence Tools:** Tavily Search API key input with connection test button; Apify API token with quota indicators.
- **Workspace Access:** Google Docs and Sheets connection status with one-click OAuth button and revoke switch.

#### 4. Settings & Persona Configuration (`/settings`)
- **Financial Metric:** User hourly rate field with live preview of value calculation formula.
- **Business Identity:** Text area for core business model, target audience, and current quarterly objectives.
- **Voice & Tone Training:** Writing sample submission area with instant stylistic analysis breakdown (sentence structure, formality, vocabulary).
- **Operating Directives:** Custom instructions defining what the agent must always do and must never do.

#### 5. Developer API (`/api`)
- **Personal Token Generation:** Create, label, and revoke scoped API tokens (`opr_live_...`).
- **Endpoint Specification:** Interactive curl and TypeScript code examples for triggering `/api/v1/run` with custom payloads.
- **Webhook Configuration:** Optional destination URL for receiving asynchronous task completion callbacks.

#### 6. User Profile (`/profile`)
- Account management, email preferences, password resets, session termination, and complete account/credential wipe.

---

## 8. Implementation Roadmap

### Phase 1: Planning & Architecture (Current)
- [x] Produce comprehensive MVP specification (`OPERATR_MVP_PLAN.md`).
- [ ] Review user design references for landing page and dashboard.

### Phase 2: Design System & Frontend Foundation
- [ ] Initialize project with Next.js App Router, Tailwind CSS, and shadcn/ui.
- [ ] Implement the black-and-white theme, classical aesthetic elements, and canvas particle system.
- [ ] Build the public landing page with pill navbar, marquee, pillar cards, and interactive demo.
- [ ] Build the authenticated dashboard shell, telemetry charts, and agent chat interface.
- [ ] Build Integrations, Settings, API, and Profile page layouts with placeholder states.

### Phase 3: Supabase Setup & Authentication
- [ ] Configure Supabase project with PostgreSQL schema, RLS policies, and migrations.
- [ ] Implement user authentication (sign up, sign in, session management).
- [ ] Implement the two-track onboarding flow (guided setup vs. skip).

### Phase 4: BYOK Security Vault & Tool Dispatcher
- [ ] Implement AES-256 encryption at rest for API keys in Supabase.
- [ ] Build credential validation routines for OpenAI, Anthropic, Google, Tavily, and Apify.
- [ ] Configure Google OAuth 2.0 flow for Docs and Sheets.

### Phase 5: Core Agent Runtime & Value Telemetry
- [ ] Implement the multi-provider LLM dispatcher with fallback routing.
- [ ] Wire up tool execution for Tavily, Apify actors, and Google Docs/Sheets.
- [ ] Add file upload support in chat with document parsing.
- [ ] Integrate real-time state streaming (`Contemplating`, `Running Research`, etc.).
- [ ] Implement human-hours estimation algorithm and live dashboard telemetry updates.

### Phase 6: Developer API, Testing & Hardening
- [ ] Expose authenticated `/api/v1/run` endpoint for external triggers.
- [ ] Conduct prompt injection security audits and tool boundary verification.
- [ ] Optimize bundle size, lighthouse scores, and particle canvas performance.
- [ ] Final end-to-end user testing.
