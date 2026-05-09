# Blink Hivemind — Project Plan

A canonical, internal knowledge base for the Blink ecosystem. Markdown-first, Obsidian-friendly, ingested from text/transcripts via an AI-assisted web app, queryable through a chat interface with citations.

---

## 1. Goals

- One trustworthy source of truth for **business-side** knowledge across the Blink ecosystem (features, decisions, client requests, behaviors, edge cases).
- Contributors add knowledge by **pasting transcripts** or **uploading `.md` files** — no audio handling in v1.
- An LLM categorizes the input, proposes where each piece belongs, and asks the user to confirm before writing.
- A chatbot answers questions over the corpus with **inline citations** to source markdown files and **streams** so users can see the answer being composed.
- The repo itself (private, on GitHub) is the canonical artifact; cloning it and opening in Obsidian must give a complete reading experience without the app.

## 2. Products in scope

1. **Management Dashboard** — orchestration area for all events
2. **Blink Welcome** — VIP registration, RSVP, and agenda viewing
3. **Blink Admission Portal** — badge printing post-purchase
4. **Blink Shop** — e-commerce front end for badge sales
5. **Event App**
6. **Organizer App**
7. **Driver App**

Features may be product-specific or **cross-cutting** across multiple products. Cross-cutting features get a single canonical home in `/shared-features/` and are referenced from each product via wikilinks.

## 3. Repository layout

```
/products/
  /<product-slug>/
    _index.md                          ← auto-generated
    overview.md                        ← hand-written, AI-edited
    /features/
      /<feature-slug>/
        feature.md                     ← canonical description (AI reads this)
        history.md                     ← attribution + diffs (AI ignores)
        /clients/                      ← only exists if overrides exist
          <client-slug>.md             ← per-client variant
    /decisions/                        ← business decisions for this product
      <decision-slug>.md

/shared-features/
  /<feature-slug>/
    feature.md
    history.md
    /products/
      <product-slug>.md                ← per-product nuances
    /clients/

/clients/
  /<client-slug>/
    overview.md                        ← who they are, what they bought
    overrides.md                       ← rollup of every override page for this client
    bespoke/
      <thing-slug>.md                  ← one-off work that wouldn't fit as a flag
    history.md

/decisions/                            ← ecosystem-wide business decisions
  <decision-slug>.md

/transcripts/                          ← raw inputs, archived for traceability
  /YYYY/MM/
    <ts>-<author>-<slug>.md

/_meta/
  taxonomy.md                          ← compact view of products/features/clients (for the categorizer)
  vault-index.md                       ← top-level index, auto-generated
  schema.md                            ← frontmatter + history-entry conventions
```

### Obsidian conventions

- **YAML frontmatter** on every file: `product`, `feature`, `clients`, `tags`, `status`, `last_updated`.
- **Wikilinks** for cross-references: `[[shared-features/qr-checkin]]`.
- One **`_index.md` per folder** with a Dataview-style listing of children, marked `<!-- auto-generated -->` and never hand-edited.
- Slugs: lowercase, kebab-case (`qr-checkin`, `acme-corp`).

## 4. File templates

### `feature.md` — clean, AI-readable

```markdown
---
product: event-app
feature: qr-checkin
status: live
clients_with_overrides: [acme, contoso]
related: [[shared-features/badge-printing]]
last_updated: 2026-05-09
---

# QR Check-in

## Overview
...

## Behaviors
...

## Edge cases
...
```

### `history.md` — per-feature changelog

```markdown
---
feature: qr-checkin
---

## 2026-05-09 — Awwab
- **Section touched:** Behaviors → Refund flow
- **Type:** update
- **Summary:** Refund window 14d → 30d, Acme request.
- **AI reasoning:** Transcript explicitly said "change refund window"; classified as update because prior behavior is now replaced globally.
- **Diff:** [collapsed]
- **Source:** [[transcripts/2026/05/2026-05-09-awwab-001]]
```

## 5. Ingestion pipeline

```
[1] User pastes transcript / uploads .md in web app
        ↓
[2] App saves raw to /transcripts/... (draft, not yet committed)
        ↓
[3] Categorization pass (Claude Sonnet 4.6)
    Inputs: transcript + _meta/taxonomy.md + retrieved similar chunks
    Output: structured filing plan
    {
      segments: [
        { text, target_path, section, op, client?,
          classification, conflicts[], reasoning }
      ]
    }
        ↓
[4] App fetches conflicting sections from repo, shows them next to proposals
        ↓
[5] User-facing review screen
    For each segment:
      • Confirm / reroute target file + section
      • Pick existing feature slug OR assign a new one (humans decide slugs)
      • For each conflict: classify as update / client-specific / cancel
      • See AI's reasoning inline
        ↓
[6] Lock check (Supabase write_leases table)
    If another in-flight ingestion holds a 5-min lease on a target file,
    surface: "Sara started editing this 2 min ago. Saving now will override."
        ↓
[7] Write phase
    • Apply edits to feature.md files
    • Append entries to corresponding history.md siblings
    • Regenerate affected _index.md files
    • Single commit to main via Octokit:
      "ingest: <author> — <one-line summary> (<ingestion-id>)"
        ↓
[8] Embedding refresh (background)
    • Diff changed files → re-chunk → embed (Voyage) → upsert pgvector
```

### Slug authority

Feature names and slugs are **decided internally by humans**. The AI never silently invents a slug. During step 5, the user must either pick an existing feature from the taxonomy or assign a new slug manually. New-feature creation is therefore an explicit action, not a side effect of ingestion.

## 6. Conflict detection

Before the LLM proposes filings (step 3), we run a vector search over existing `feature.md` chunks for each segment of the transcript. Anything with cosine similarity ≥ ~0.78 is passed to the LLM as "this might already be covered — flag if it contradicts." Without this step, the LLM would file new content next to contradictory old content without noticing.

Conflict classification options shown to the user:
- **Update** — replaces prior behavior globally; old content is moved into history
- **Client-specific** — old behavior remains the default; new behavior becomes a `clients/<slug>.md` override page
- **Cancel** — the new info is rejected; original transcript is still archived for audit

## 7. Chat retrieval

- Embed user query → top-K (~12) over `feature.md` chunks **only** (history files excluded by metadata filter).
- Streaming Claude response with citations as wikilinks: `[[products/event-app/features/qr-checkin/feature.md]]`.
- Web app renders citations as clickable links and inlines the cited section.
- Same wikilink format works untouched in Obsidian.

## 8. Stack

| Piece | Choice |
|---|---|
| Web app | Next.js on Netlify |
| KB storage | Private GitHub repo, written via Octokit (REST API) |
| App DB + vector DB | Supabase (Postgres + pgvector) |
| Embeddings | Voyage `voyage-3-large` |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`); fall back to Opus 4.7 (`claude-opus-4-7`) only if categorization quality slips |
| Auth | **Deferred.** Shared password for v1; Clerk later |
| Local browse | Team clones the repo and opens in Obsidian |

Expected cost at low volume (~50 ingestions/mo, ~500 chats/mo): **$5–25/mo** total.

## 9. Supabase schema (app state, not in repo)

```
ingestions(id, author, transcript_path, status, plan_json, created_at)
write_leases(file_path, ingestion_id, acquired_at, expires_at)
embeddings(file_path, chunk_id, content, embedding vector(1024), updated_at)
clients(slug, name, notes)
features(slug, product, status, created_by, created_at)   ← human-managed taxonomy
```

When auth lands: add `users` table joining on `ingestions.author` and `features.created_by`.

## 10. Build order

### Week 1 — bare ingestion loop
- Repo skeleton: 7 product folders, stub `feature.md` per product, hand-seeded `_meta/taxonomy.md`.
- Next.js app on Netlify, single page: paste transcript → Claude proposes plan → user reviews → commit to GitHub → write `history.md`.
- No embeddings, no chat, no locks yet.

### Week 2 — chat with citations
- Background job: embed all `feature.md` chunks into pgvector.
- Re-embed on every ingestion commit.
- Chat page with streaming + clickable wikilink citations.

### Week 3 — conflicts + concurrency
- Vector-search-driven conflict detection during categorization.
- Three-way classifier UI (update / client-specific / cancel).
- Write-lease table + override warnings.

### Week 4 — polish
- Auto-regenerated `_index.md` per folder.
- Auto-rebuilt `_meta/taxonomy.md`.
- Per-client override pages and `/clients/<slug>/overrides.md` rollups.

## 11. Resolved decisions

- **Folder hierarchy:** product-first, with `/shared-features/` for cross-cutting.
- **Editing model:** app-only writes in v1. Humans browse in Obsidian after `git pull`, but never push.
- **Conflict types:** update / client-specific / cancel.
- **Attribution:** separate `history.md` per feature, never read by the AI for Q&A.
- **Client dimension:** real and first-class. Multi-tenant flag overrides → `clients/<slug>.md` override pages on the affected feature. Bespoke one-off work that wouldn't fit as a flag → `/clients/<slug>/bespoke/<thing>.md`.
- **Slug authority:** humans decide feature slugs; AI never invents them silently.
- **Decisions vs features:** kept in separate folders; categorizer asks the user when ambiguous.
- **Stack:** Next.js + Netlify + Supabase + Voyage + Claude Sonnet 4.6 + GitHub.
- **No audio in v1:** input is `.md` upload or pasted transcript only.

## 12. Out of scope for v1

- Audio capture and speech-to-text.
- Production auth (shared password is fine for the internal pilot).
- Slack bot (web app only; Slack later).
- Public/external access (private repo, internal users only).
- Automated ingestion of existing PRDs and code docs (those will be pasted in manually as transcripts when ready).
