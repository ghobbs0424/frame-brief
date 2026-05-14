# Frame Brief — Claude Code Handoff Document

## What Is Frame Brief

Frame Brief is an AI-powered creative production brief tool for photographers and videographers. Users paste meeting notes (or use a meeting bot) and the app generates a structured, multi-page production brief with concept pages for each deliverable — shot lists, lighting, wardrobe, locations, script outlines, color palettes, and more. It also has an Idea Capture workspace for personal creative ideas that generates mini creative briefs from voice or text input.

**Live URL:** https://frame-brief.vercel.app  
**GitHub:** https://github.com/ghobbs0424/frame-brief (public)  
**Owner:** GH Productions — hello@ghproductions.co

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite (single `src/App.jsx` file, ~1300 lines) |
| Styling | Inline styles only — no CSS framework |
| Fonts | Lora (serif), IBM Plex Mono — loaded from Google Fonts |
| Backend | Vercel serverless functions (`api/` folder) |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Auth | Supabase Auth — email/password, magic link, Google OAuth |
| AI | Anthropic Claude claude-sonnet-4-6 via direct API calls |
| Meeting Bot | Recall.ai — joins Google Meet/Zoom/Teams, records + transcribes |
| Transcription | AssemblyAI (configured in Recall.ai dashboard) |
| Deployment | Vercel — auto-deploys from GitHub main branch |

---

## Repository Structure

```
frame-brief/
├── api/
│   └── recall-webhook.js     ← Vercel serverless function (Recall.ai integration)
├── src/
│   ├── App.jsx               ← ENTIRE frontend (all components in one file)
│   ├── main.jsx              ← React entry point
│   └── FrameBrief.jsx        ← (unused legacy file, can be deleted)
├── index.html
├── package.json              ← includes @supabase/supabase-js
├── vite.config.js
└── CLAUDE.md                 ← this file
```

---

## Environment Variables

### Vercel (production)
```
VITE_ANTHROPIC_KEY          — Anthropic API key
VITE_SUPABASE_URL           — Supabase project URL
VITE_SUPABASE_ANON_KEY      — Supabase anon/public key
SUPABASE_URL                — Same URL (for serverless functions, no VITE_ prefix)
SUPABASE_SERVICE_KEY        — Supabase service role key (admin access for webhook)
RECALL_API_KEY              — Recall.ai API key: e4ec1babae652ff86912f365199f8328f2b80470
VITE_RECALL_API_KEY         — Same key with VITE_ prefix (legacy, can remove)
```

---

## Database Schema (Supabase)

### Table: `projects`
```sql
id              uuid primary key default gen_random_uuid()
user_id         uuid references auth.users(id) on delete cascade not null
title           text
client_name     text
status          text default 'Draft'    -- Draft/In Progress/Review/Delivered/Archived
brief           jsonb not null default '{}'
doc_count       integer default 0
recall_bot_id   text                    -- Recall.ai bot ID when meeting bot is used
recall_status   text                    -- bot_joined / transcript_ready / brief_ready / empty_transcript
recall_transcript text                  -- raw transcript text from AssemblyAI
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**RLS Policies:** Users can only read/write their own projects. The serverless webhook uses `SUPABASE_SERVICE_KEY` which bypasses RLS.

---

## Component Architecture

All components live in `src/App.jsx`. **Critical rule: never define a React component with hooks inside another component** — this causes React error #300. All components must be top-level functions.

### Component List (in order in file)
```
ErrorBoundary          — class component, wraps entire app, catches crashes
StatusBadge            — dropdown for Draft/In Progress/Review/Delivered/Archived
VoiceMicBtn            — Web Speech API mic button, streams interim results
IdeaPage               — full-page expanded view for an idea brief
IdeaCapture            — workspace screen with custom workspaces + voice input
AuthScreen             — login/signup/magic link/Google OAuth
Editable               — click-to-edit inline text (Notion-style)
Tag                    — editable tag pill with URL detection
Section                — collapsible section with arrow toggle
TodoList               — checklist with inline add
PropRow                — label+value row for project metadata table
AddBtn                 — "+ Add item" style button
HR                     — horizontal rule divider
DocUpload              — drag-and-drop file upload (PDF, Word, TXT)
OverviewPage           — project overview page (title, concepts list, todos, etc.)
ConceptPage            — individual concept page (lighting, shots, script, etc.)
MeetingBotPanel        — meeting bot UI (paste link → bot joins → auto-brief)
Dashboard              — projects grid with collapsible sidebar
AIChatPanel            — AI chat drawer for refining briefs
FrameBriefApp          — main app component with all state and routing
FrameBrief             — default export, wraps FrameBriefApp in ErrorBoundary
```

### Safety Helpers (global)
```js
const arr = (x) => Array.isArray(x) ? x : [];  // always returns array
const obj = (x) => ...                           // always returns object
```
**Use `arr()` everywhere you access arrays from Supabase/AI/localStorage** to prevent "reading 'length' of undefined" crashes.

---

## App State & Routing

The app uses a simple `screen` string for routing — no React Router:

```
"dashboard"   → Dashboard component
"input"       → New Brief input screen (paste notes or use meeting bot)
"loading"     → Spinner while AI generates brief
"doc"         → Project brief view (OverviewPage + ConceptPage)
"ideas"       → IdeaCapture workspace
```

**Active project state:**
```js
const [activeProject, setActiveProject] = useState(null);
// activeProject = full row from Supabase projects table
// brief = activeProject?.brief (the jsonb column)
```

**Auto-save:** Brief edits debounce 1.5s then call `saveProject()` → Supabase upsert.

---

## Brief JSON Structure

The `brief` field in Supabase is a JSONB object:
```json
{
  "coverEmoji": "🎬",
  "projectTitle": "",
  "clientName": "",
  "projectType": "",
  "date": "",
  "timeline": "",
  "budget": "",
  "logline": "",
  "overview": "",
  "moodKeywords": [],
  "moodDescription": "",
  "references": [],
  "overallLocations": [{"name": "", "description": ""}],
  "overallWardrobe": [],
  "overallProps": [],
  "generalNotes": "",
  "clientActionItems": [{"id": "ca-1", "text": "", "done": false}],
  "internalTodos": [{"id": "it-1", "text": "", "done": false}],
  "concepts": [{
    "id": "concept-1",
    "emoji": "🎥",
    "title": "",
    "type": "",
    "logline": "",
    "description": "",
    "moodKeywords": [],
    "inspiration": [],
    "locations": [{"name": "", "vibe": "", "description": "", "shots": ""}],
    "lighting": {"style": "", "description": "", "technical": ""},
    "colorHex": ["#c8a97e", "#3d2b1f", "#f5ede0"],
    "colorDescription": "",
    "wardrobe": [],
    "wardrobeNotes": "",
    "props": [],
    "shotList": [{"number": "01", "type": "", "description": "", "lens": "", "notes": ""}],
    "script": {"hook": "", "act1": "", "act2": "", "act3": "", "cta": ""},
    "deliverableFormat": "",
    "directorNotes": ""
  }]
}
```

---

## Idea Capture

Separate workspace within Frame Brief for personal creative ideas. Stored in **localStorage** (not Supabase) per user ID.

- **Workspaces:** Custom workspaces with emoji picker. Default: GH Productions, All Shades of Hue, Frame Brief, Personal
- **localStorage keys:**
  - `framebrief_ideas_{userId}` — ideas object keyed by workspace ID
  - `framebrief_workspaces_{userId}` — array of workspace objects
- **Flow:** User speaks/types an idea → hits "✦ Generate Brief" → Claude generates a mini creative brief with hook, outline, key points, script notes, locations, props, shot list, to-do list, tags
- **IdeaPage:** Full expandable page for each idea brief, all fields click-to-edit

**Idea brief JSON structure:**
```json
{
  "title": "",
  "logline": "",
  "format": "",
  "targetAudience": "",
  "hook": "",
  "angle": "",
  "outline": [{"act": "", "description": ""}],
  "keyPoints": [],
  "scriptNotes": "",
  "locations": [{"name": "", "notes": ""}],
  "props": [],
  "shotList": [{"number": "01", "type": "", "description": ""}],
  "toDoList": [{"text": "", "done": false}],
  "estimatedLength": "",
  "tags": []
}
```

---

## Meeting Bot (Recall.ai) — Current Status

### What Works ✅
- Bot creation: user pastes meeting link → bot joins → project created with `recall_bot_id`
- Webhook reception: Recall.ai fires `bot.done` and `bot.call_ended` events to `/api/recall-webhook`
- Project lookup by `recall_bot_id`
- Brief auto-generation from transcript using Claude

### What's Broken ❌
- **AssemblyAI is not transcribing automatically.** The bot records video but AssemblyAI async transcription isn't being triggered automatically after each call. Recall.ai shows "No transcript available" and offers a manual "Generate transcript using Async Transcription" button.
- The webhook fires and finds the project correctly but gets an empty transcript array from Recall's transcript endpoint.

### Root Cause
AssemblyAI credentials are configured in Recall.ai dashboard (Transcription → AssemblyAI) but async transcription is not being triggered automatically post-call. Need to either:
1. Enable automatic async transcription in Recall.ai → Meeting Bot Setup
2. OR use Recall.ai's real-time transcription instead of async
3. OR trigger async transcription manually via API after `bot.done` fires

### Recall.ai API Details
- Region: `us-west-2`
- API key: `e4ec1babae652ff86912f365199f8328f2b80470`
- Webhook URL configured: `https://frame-brief.vercel.app/api/recall-webhook`
- AssemblyAI API key: `9c0a4352cd8a4da18c47f2d5cc63ad34`

### Webhook Routes (`api/recall-webhook.js`)
```
POST /api/recall-webhook?action=create-bot    → creates Recall bot (called from browser)
POST /api/recall-webhook?action=fetch-transcript → manually fetches transcript (debugging)
POST /api/recall-webhook                       → receives Recall.ai webhook events
```

### Fix to Implement
After `bot.done` fires, trigger async transcription via Recall.ai API:
```js
// After receiving bot.done event, trigger async transcription
await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/async_transcription`, {
  method: "POST",
  headers: { "Authorization": `Token ${RECALL_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ provider: "assembly_ai" })
});
// Then listen for transcription_complete webhook event
```

---

## CSS Architecture

All styles are inline in JSX. Global CSS is injected via a `<style>` tag in the main app render:

```css
/* Key classes */
.nb              — sidebar nav button (hover + .on active state)
.tbtn            — toolbar button (header area)
.spin            — CSS rotation animation for loading spinners
.mobile-only     — display:none on desktop, display:flex on mobile
.hide-on-mobile  — display:none on mobile
.desktop-sidebar — hidden on mobile via media query
.sidebar-overlay — dark overlay for mobile drawer
.sidebar-drawer  — slide-in panel for mobile
.mobile-hamburger — ☰ button, hidden on desktop
```

**Breakpoint:** `768px` — below this, desktop sidebar hides and mobile drawer activates.

**Design tokens (approximate):**
- Primary dark: `#37352f`
- Text muted: `#9b9a97`
- Text subtle: `#c4c3bf`
- Border: `#f1f0ef`
- Background alt: `#fafaf9`
- Accent orange: `#e97942`
- Accent blue: `#1a56c4`
- Fonts: `'Lora', Georgia, serif` / `'IBM Plex Mono', monospace`

---

## Known Issues & Bugs

1. **Meeting bot transcript** — AssemblyAI not transcribing automatically (see above)
2. **Shared access** — not yet implemented. Planned: `project_members` table with owner/editor/viewer roles
3. **Google OAuth** — works in production (Supabase + Google Cloud Console configured)
4. **Stripe/payments** — not implemented yet
5. **`src/FrameBrief.jsx`** — unused legacy file in repo, can be deleted

---

## Pending Features (Priority Order)

### High Priority
1. **Fix Recall.ai async transcription** — trigger it programmatically after `bot.done`
2. **Shared access** — let users share a brief with editor or viewer permissions
3. **Stripe integration** — subscription billing ($10-20/month target)

### Medium Priority
4. **Recall.ai Calendar integration** — auto-join meetings from Google Calendar
5. **PDF export** — export briefs as branded PDFs for clients
6. **Custom domain** — purchase framebrief.com once validated with beta users

### Low Priority
7. **Team accounts** — multiple users under one subscription
8. **Portfolio/CRM** — Phase 2 of the larger creative platform vision

---

## Business Context

- **Owner:** Garrison Hobbs, GH Productions (videographer/photographer, Houston TX)
- **Also runs:** All Shades of Hue (camera accessories brand — camera strap, Gimbal Holster XL, lens pouch)
- **Goal:** Frame Brief as first recurring revenue product ($10-20/month SaaS)
- **Beta reviewers this week:** Larry and Tom (fellow videographers)
- **Timeline:** Get meeting bot working + share with Larry and Tom this week

---

## How Claude Code Should Work With This Project

```bash
# Install Claude Code if not already installed
npm install -g @anthropic-ai/claude-code

# Navigate to project
cd frame-brief

# Start Claude Code
claude

# Example prompts:
# "Fix the Recall.ai async transcription — after bot.done fires, trigger async transcription via the API and listen for the transcription_complete event"
# "Add Stripe subscription billing with a $15/month plan"
# "Build shared access — project_members table with owner/editor/viewer roles"
```

**Important context for Claude Code:**
- All frontend code is in `src/App.jsx` — one large file
- Never define components with hooks inside other components (React error #300)
- Always wrap array accesses from external data with `arr()` helper
- The app uses simple string-based routing (`screen` state), not React Router
- Supabase auto-save uses 1.5s debounce via `window._briefSaveTimer`
- Brief JSON must always have `concepts`, `clientActionItems`, `internalTodos` as arrays
