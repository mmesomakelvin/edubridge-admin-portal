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
- Replace the **landing image** per program — the image on its homepage program card
  (program pages have no hero image today; `ProgramCard.tsx` is the only consumer).
- Scope is the **6 learner programs only**. Corporate Training is excluded entirely (it has
  no prices or cohorts in the site data; it stays in code).
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
    // data-school, school-of-mgmt-consulting, advanced-financial-modeling,
    // school-of-hr-and-analytics, project-finance-modeling
  }
}
```

**Program keys** are the public repo's **folder slugs** (`product/sections/<slug>/`), the
same keys `public/cohorts.json` and the Apps Script win-back sheet already use. Note the
consulting key is `school-of-mgmt-consulting` even though its URL is
`/school-of-management-consulting`. The portal keeps a fixed slug → `{ name, href,
homeCardId }` map (e.g. `school-of-finance → prog-1`, `school-of-hr-and-analytics →
prog-hr`) so it can link to live pages and the overlay can find each homepage card.

### Derived, never edited
Two pieces of public text are **computed from `cohorts`**, not stored:
- Program hero `heroContent.nextCohortLabel` ("Next cohort starts Saturday, 23 January 2027").
- Homepage card `nextCohort` ("January 2027").

Both are hard-coded today and already stale (e.g. the Finance card says "October 2026"
while the real next open cohort is 23 Jan 2027) — this is the real root of issue #5. The
overlay derives them from the earliest `open` cohort (`cohort-status` logic). When none
is open: hero label = "New cohort dates coming soon", card `nextCohort` = `null` (the card
already renders `null` for Corporate, so no new UI). The homepage card
`price` is likewise derived from the `full` pricing option's `amount`.

### Overlay strategy
Each program page/home card starts from its build-time `data.json` (safe fallback),
then **replaces three sub-objects wholesale** for that program: `cohorts`, `pricing`
(+ `heroPriceLabel` → `heroContent.priceLabel`), and the homepage card `imageUrl`.
Wholesale replacement avoids fragile per-field merging. Homepage cards read the **same**
per-program entries, so image/price/next-cohort have one source, not two. A program
missing from `content.json` (or a malformed entry) keeps its build-time defaults.

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

**2. Dashboard** — one row per program (the 6 learner programs): thumbnail · name ·
**next open cohort** (computed with the same `cohort-status` logic, ported verbatim) ·
current price · **Edit**. Header: "Last published by hello@ · <time>" + "View live site ↗".

**3. Program editor** (per program, three tabs):
- **Cohorts** — table of cohort rows (add/edit/remove): name, start/end date pickers,
  format, seats, and a live **Open / Full / Ended** status badge matching public output.
- **Pricing** — edit each pricing option + hero price label, inline validation.
- **Landing image** — current preview + drag-drop replace (auto-optimized), with a note
  of where it appears (the program's card on the homepage).

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
- **Caching freshness:** `content.json` is served with a **60 s** cache max-age (Blob
  `cacheControlMaxAge: 60`), i.e. "live within about a minute". Revisit only if staff find
  it too slow.
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

- **Corporate excluded** — portal covers the 6 learner programs only (2026-10-14).
- **Keys = folder slugs** (match `cohorts.json` + win-back sheet) (2026-10-14).
- **Next-cohort text is derived**, never edited (fixes issue #5 at the root) (2026-10-14).
- **`content.json` TTL = 60 s** (2026-10-14).

**Open (for plan stage):**
- Hosting detail: new GitHub repo + new Vercel project for `admin.edubridgeacademy.com`.
