# EduBridge Admin Portal

Internal admin portal that lets trusted EduBridge staff change **program dates**,
**pricing**, and **landing/placeholder images** for every course — without a developer
or a redeploy. Once the public site (`www.edubridgeacademy.com`) reads the content store
(a separate follow-up in the public repo), published changes appear there within about a minute.

This is a **new, separate project** from the public marketing site. It lives on its own
URL (`admin.edubridgeacademy.com`) with its own deployment, secrets, and login.

> **Status:** being built on the `feat/admin-portal` branch (plan:
> `docs/superpowers/plans/2026-10-14-admin-portal.md`). Not live yet.

---

## Start here

1. **The design:** [`docs/SPEC.md`](docs/SPEC.md) — architecture, content model, screens, auth,
   rollout and testing. The original look is in [`design/mockup.html`](design/mockup.html).
2. **How it was built:** [`docs/superpowers/plans/2026-10-14-admin-portal.md`](docs/superpowers/plans/2026-10-14-admin-portal.md)
   — the task-by-task plan (Tasks 1–18).
3. **Next up after go-live:** the Analytics page design,
   [`docs/superpowers/specs/2026-10-23-analytics-design.md`](docs/superpowers/specs/2026-10-23-analytics-design.md).
4. **To run it locally:** see *Local development* below.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (see comments there). Use a **dev** Blob store locally.
3. First time only: `npm run seed -- --public-repo "<path to ea-website-revamp>"`, then `npm run parity -- --public-repo "<same path>"`.
4. `npm run dev` → http://localhost:3000

**Demo mode (no Google/Blob needed):** set `ADMIN_DEMO=1` and `DEMO_PUBLIC_REPO=<path to ea-website-revamp>` in `.env.local`.
The UI runs against an in-memory copy of today's site data. Production builds ignore these settings.

**Tests:** `npm test` · **Types:** `npm run typecheck`

**How the store is laid out (Vercel Blob):** `content.json` is what the public site reads and is
overwritten on every publish. Each version is also written once to `versions/content-vNNNNNN.json`;
the portal reads the newest of those, because Blob's CDN can keep serving an overwritten public file
for several seconds. `backups/` holds the version each publish replaced (used by rollback),
`cohorts-feed.json` is the win-back feed, and `images/` holds the optimised landing images.

---

## What this portal does (scope)

For each of the 7 learner programs (Corporate Training is out of scope; Securities Trading added 2026-10-23):

- **Cohort dates & seats** — add/edit/remove cohorts; open/close; live Open/Full/Ended status.
- **Pricing** — price labels, amounts, installment text, hero price label.
- **Landing image** — replace the program's homepage card image.

**Out of scope:** page copy, FAQs, testimonials, partners, SEO, new-program creation,
per-user accounts.

## How it works (summary — full detail in `docs/SPEC.md`)

- **Stack:** Next.js (App Router) on Vercel, own subdomain.
- **Store:** Vercel Blob — one `content.json` (source of truth for editable fields,
  seeded from the public site's current JSON) + image files + a derived `cohorts-feed.json`.
- **Public site** reads the store at runtime and overlays the editable fields onto its
  build-time defaults (falls back to defaults if the store is unreachable). This fixes
  the public site's "next open cohort" mismatch (issue #5 in the public repo).
- **Auth:** "Sign in with Google" via Auth.js, locked to a single allowlisted account
  (`hello@edubridgeacademy.com`); password held by two staff. No per-user audit.
- **Win-back sync:** on publish, the portal also writes `cohorts-feed.json`; the existing
  Google Apps Script win-back automation is repointed to read it, so dates never desync.
  The feed records the content `version` it was built from. After writing it, the portal
  re-reads the live content and rewrites the feed if a newer publish landed meanwhile. A
  feed that is still behind (for example after a failed write) is rebuilt when the Programs
  page opens and by a daily Vercel Cron (`/api/cron/sync-feed`, which needs `CRON_SECRET`
  set in the Vercel project).

## How the portal stays safe (in plain English)

The portal can change what the public website says, so the main thing to stop is
someone else getting the portal to act on their behalf.

### The threat: XSS ("cross-site scripting")

A web page is text plus small programs (scripts) that the browser runs. **XSS** is
when an attacker sneaks *their own* script into *our* page. The browser can't tell
it apart from ours, so it runs it, as the signed-in admin. That script could quietly
publish fake prices or dates.

Think of it like a note slipped into a stack of signed letters: the clerk processes
it because it's in the right pile.

The usual ways in are: typing something that looks like code into a text box (e.g.
a cohort name), a link or image address that is really a script, or uploading a
"picture" that is secretly a web page.

### Defence 1: never treat text as code

Everything staff type (names, prices, labels) is shown as plain text, never as page
code. Image addresses must point at our own storage. Uploaded images are opened,
checked, and re-saved as fresh WebP pictures, so a disguised file can't survive.

### Defence 2: the Content Security Policy (CSP)

A **CSP** is a set of house rules the portal sends with every page, telling the
browser what it may and may not do. Ours says, in effect:

- **Only run scripts stamped with today's secret code.** Each time a page loads, the
  portal makes up a new random code (a "nonce") and stamps it on its own scripts.
  The browser runs only scripts with that exact code. A script slipped in by an
  attacker doesn't know the code, so the browser refuses to run it — even if every
  other defence failed. Like a bouncer with a guest list that changes every night.
- **Pictures only from us** and our image storage.
- **Forms may only go to us, or to Google** for sign-in.
- **No other website may show the portal inside its own page** (stops "clickjacking",
  where a fake page tricks you into clicking real portal buttons).

### Defence 3: security headers

Extra instructions sent with every page: always use HTTPS; don't guess file types;
don't tell other sites which portal page you came from; never ask for the camera,
microphone or location.

### Defence 4: XSS guard tests

Automatic checks that run with every test run (`npm test`). They read the portal's
own code and **fail** if anyone adds a known-risky pattern — inserting raw page code,
running text as a program (`eval`), or opening outside links in a way that lets
that site control our tab. They're a smoke alarm: they don't stop a fire on their
own, but they make sure nobody quietly removes a defence later.

### And behind all of that

Only allow-listed Google accounts can sign in; every publish, rollback and upload
re-checks the sign-in on the server; and the sign-in cookie can't be read by
scripts at all.

The code for this lives in `src/lib/csp.ts`, `src/proxy.ts`, `next.config.ts`,
`tests/csp.test.ts` and `tests/xss-guards.test.ts`.

## Related

- **Public site repo:** `EA_Website_Revamp` (the Vite marketing site) — source of the
  seed data and the consumer of the content store. Relevant files there:
  `product/sections/*/data.json`, `public/cohorts.json`, `src/lib/cohort-status.ts`,
  the program pages and homepage components, and `apps-script/Code.gs` (win-back).
- **Canonical public domain:** `https://www.edubridgeacademy.com`
- **Planned admin domain:** `https://admin.edubridgeacademy.com`

## Decisions locked

- Separate repo (this one), not a monorepo.
- Light "command console" visual direction.
- Instant live-read architecture (runtime store), not git-commit-and-rebuild.

## To do (high level)

- [x] Plan the build from `docs/SPEC.md` and get it approved.
- [x] Scaffold the Next.js app + Auth.js (Google) + Vercel Blob.
- [x] Seed `content.json` from the public site's current data; parity-check.
- [x] Build dashboard + program editor (cohorts / pricing / image) + review-and-publish.
- [ ] Add the runtime overlay to the public site (separate PR in the public repo).
- [ ] Repoint the Apps Script win-back automation to the Blob cohorts feed.
- [ ] Set up the new GitHub repo + Vercel project + `admin.edubridgeacademy.com`.
