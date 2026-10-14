# Admin Content Portal — Design Spec

**Date:** 2026-10-14
**Status:** Approved for planning (pending written-spec review)
**Author:** Mmesoma Okoronkwo + Claude

---

## 1. Purpose & Intent

Internal, non-technical staff currently cannot change program **dates**, **pricing**,
or the per-course **placeholder images** without a developer editing JSON and
redeploying (exactly the manual loop performed repeatedly throughout development).

This project delivers a small **admin portal** — on its **own URL**
(`admin.edubridgeacademy.com`) — that lets a trusted staff account self-serve those
three content types for every learner program, with changes appearing on the live
public site within seconds.

**Success looks like:** a staff member signs in, changes a cohort date / price /
image, publishes, and the public site reflects it in seconds — no developer, no
redeploy, no desynced automation.

### In scope
- Edit **cohort dates & seats** (start, end, format, seatsRemaining, totalSeats; open/close) per program.
- Edit **pricing** (price labels, amounts, installment text, hero price label) per program.
- Replace **landing/placeholder images** (program hero + homepage card) per program.
- A single shared, Google-locked login.
- Keeping the win-back automation's cohort feed in sync.

### Out of scope (stays in code)
Hero/body copy, FAQs, testimonials, partners, SEO metadata, new-program creation,
per-user accounts / audit, approval workflows.

---

## 2. Architecture

Three pieces plus a shared store.

1. **Public site** — the existing Vite SPA at `www.edubridgeacademy.com`, URL unchanged.
   Gains a lightweight **runtime overlay**: for the editable fields only, it fetches the
   content store and overlays those values onto the current build-time `data.json`
   defaults. Everything else stays static. If the store is unreachable, pages fall back
   to build-time defaults (never blank).

2. **Admin portal** — a **new, separate Next.js (App Router) app** deployed as its own
   Vercel project on `admin.edubridgeacademy.com`. Next.js is required for secure
   server-side login and writes (a Vite SPA cannot hold secrets or run auth callbacks).

3. **Content store — Vercel Blob:**
   - `content.json` — source of truth for the editable fields, seeded once from current JSON.
   - `cohorts-feed.json` — derived feed for the win-back automation (see §6).
   - Image binaries — public Blob objects, hashed filenames.
   - Timestamped `content.json` backups for one-click rollback (§5).

### Data flow
- **Read (visitor):** page load → fetch `content.json` from Blob (edge-cached, short TTL)
  → overlay onto defaults → render.
- **Write (staff):** edit in portal → Next.js server action validates → writes
  `content.json` (+ `cohorts-feed.json`, + any image) to Blob → public reflects on next load.

Fixes GitHub issue #5 as a side effect: editable dates become a single source of truth.

---

## 3. Content Model, Overlay & Validation

### `content.json` shape (one entry per program slug)
```jsonc
{
  "version": 12,                     // bumped each save; optimistic lock + cache-bust
  "updatedAt": "2026-10-14T12:30:00Z",
  "updatedBy": "hello@edubridgeacademy.com",
  "programs": {
    "school-of-finance": {
      "cohorts":  [ { "id","name","startDate","endDate","format","seatsRemaining","totalSeats" } ],
      "pricing":  [ { "id","title","priceLabel","amount", "...": "..." } ],
      "heroPriceLabel": "₦175,000 · or 2 installments of ₦87,500",
      "landingImageUrl": "https://…blob…/finance-<hash>.jpg"
    }
    // data-school, school-of-management-consulting, advanced-financial-modeling,
    // school-of-hr-and-analytics, project-finance-modeling, (corporate: price-only)
  }
}
```

### Overlay strategy
Each program page/home card starts from its build-time `data.json` (safe fallback),
then **replaces three sub-objects wholesale** for that program: `cohorts`, `pricing`
(+ `heroPriceLabel`), and the landing `imageUrl`. Wholesale replacement avoids fragile
per-field merging. Homepage cards read the **same** per-program entries, so image/price
have one source, not two.

### Validation (enforced in portal before save)
- **Dates:** valid ISO; `start < end`; past-dated start allowed but **warned**.
- **Seats:** integers; `0 ≤ seatsRemaining ≤ totalSeats`.
- **Price:** `amount` positive integer; `priceLabel` free text.
- **Image:** JPG/PNG/WebP; ≤ ~5 MB; min-dimension check; re-encoded/optimized via `sharp`.

### Seeding
One-time migration reads today's `data.json` → generates initial `content.json` →
uploads to Blob. After cutover the store owns these fields. A **parity check** diffs the
seeded values against what the site renders today (expect zero visible change).

---

## 4. Admin Portal Screens

**1. Login** — single "Sign in with Google" button, locked to `hello@edubridgeacademy.com`;
any other account → "Not authorized."

**2. Dashboard** — one row per program: thumbnail · name · **next open cohort** (computed
with existing `cohort-status` logic) · current price · **Edit**. Header: "Last published
by hello@ · <time>" + "View live site ↗". Corporate shown price-only (no cohorts).

**3. Program editor** (per program, three tabs):
- **Cohorts** — table of cohort rows (add/edit/remove): name, start/end date pickers,
  format, seats, and a live **Open / Full / Ended** status badge matching public output.
- **Pricing** — edit each pricing option + hero price label, inline validation.
- **Landing image** — current preview + drag-drop replace (auto-optimized), with a note
  of where it appears (program hero + homepage card).

**4. Publish** — "Review & publish" shows a plain-language **diff** ("Q4 2026: seats 20 → 0;
next start 16 Jan → 23 Jan"), confirm → validate → write to Blob → toast "Published — live
in a few seconds" + "View live page ↗". **Conflict guard:** if `version` changed since the
editor opened, warn ("updated by another session — reload") instead of overwriting.

**Look & feel:** EduBridge brand (Poppins, teal/green) so it feels native; utilitarian,
mobile-friendly.

---

## 5. Auth & Security

- **Auth.js (NextAuth) + Google provider**, server-side. On sign-in, verify email
  **equals** an allowlisted address (`ALLOWED_EMAILS` env, initially just
  `hello@edubridgeacademy.com`) **and** `email_verified`. Otherwise no session.
- Sessions: httpOnly, Secure, SameSite cookies; Auth.js CSRF on sign-in.
- **Middleware** protects all routes and write endpoints; writes re-check the session
  server-side (client never trusted).
- **Secrets (server-only, Vercel env, never committed, never shipped to browser):**
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`.
  Public site needs **no** secret — `content.json`/images are public-read.
- **Image safety:** server-side MIME + size checks; `sharp` re-encode strips malicious
  payloads; hashed filenames prevent collisions/overwrites.
- **Isolation:** separate Vercel project, own subdomain, own env — a fault there cannot
  reach the public deployment or its secrets.
- **Rollback safety net:** each publish writes the previous `content.json` as a timestamped
  Blob backup → one-click "roll back last publish."
- Google OAuth redirect URI: `https://admin.edubridgeacademy.com/api/auth/callback/google`.

---

## 6. Win-back Automation Sync (decision: option a)

The win-back automation (Apps Script) reads `public/cohorts.json`. To prevent desync when
staff change dates:
- On each publish, the portal also writes a derived **`cohorts-feed.json`** to Blob
  (same shape the Apps Script consumes).
- The Apps Script is **repointed** to read that Blob feed instead of the committed file.
- Verified by editing a date and confirming it flows through to the automation.

---

## 7. Rollout (public site keeps working throughout)

1. **Scaffold** admin app (auth + editor + Blob) and run seed migration. Public untouched.
2. **Overlay, invisibly** — public site reads the store; identical output proves it works;
   fallback-to-defaults guarantees it can't go blank.
3. **Repoint win-back** to the Blob cohorts feed; verify end-to-end.
4. **Hand to staff** (the two password-holders) for real use.

Each phase is shown locally / on a staging URL and approved before going live
(show-before-deploy).

---

## 8. Testing

- **Automated:** validation rules (date order, seat bounds, price); overlay/merge
  correctness; `cohort-status` agreement across pages/calendar/forms; conflict/version
  guard; auth rejection of non-allowlisted accounts.
- **Manual E2E (staging before go-live):** sign in → change a date → publish → appears
  live in seconds; image upload; conflict warning; one-click rollback.
- **Parity check:** seeded `content.json` vs current rendered output — zero visible change.
- **Resilience:** store-unreachable → public site still renders from build-time defaults.

---

## 9. Risks & Notes

- **Cost:** a second Vercel project + Blob fits free/Hobby tiers at this volume; flag if
  limits require Vercel Pro (no silent bills).
- **Vercel deploy quirk** (git-push deploys blocked; CLI deploys): the chosen runtime-store
  approach sidesteps it — a content change triggers no deploy.
- **Shared account:** no per-user audit by design; "updatedBy" is always `hello@`.
- **Caching freshness:** short edge TTL + `version` cache-bust keeps reads fast and fresh;
  tune TTL during Phase 2.
- **Auth provider provisioning:** Google OAuth + Auth.js are free/first-party (no
  Marketplace dependency); Vercel Blob is first-party storage.

---

## 10. Relevant Files / Surfaces

- Public data (seed source + fallback): `product/sections/*/data.json`,
  `product/sections/home/data.json`, `public/cohorts.json`.
- Public overlay integration: `src/lib/` (new content-loader + overlay), program pages
  `src/sections/*/components/*Page.tsx`, home `FeaturedPrograms`/`HeroSection`,
  `src/sections/calendar/`, `src/lib/cohort-status.ts`.
- Win-back: `apps-script/Code.gs`.
- New admin app: separate Next.js project (own repo/dir) + Vercel project.

---

## 11. Decisions & Open Questions

**Decided:**
- **Separate repo** for the admin app (not a monorepo). New folder:
  `C:\Users\okoro\Documents\edubridge-admin-portal`. Implementation happens in a
  fresh Claude Code session opened in that folder. This repo (the public site) only
  gains the small "read the store + overlay" code.
- **Visual direction:** light "command console" — white ground, left sidebar, EduBridge
  green accent used with restraint (see `design/mockup.html`).

**Open (for plan stage):**
- Exact program slugs/keys to include for Corporate (price-only) vs the 6 learner programs.
- Final edge-cache TTL for `content.json`.
- Hosting detail: new GitHub repo + new Vercel project for `admin.edubridgeacademy.com`.
