# EduBridge Admin Portal

Internal admin portal that lets trusted EduBridge staff change **program dates**,
**pricing**, and **landing/placeholder images** for every course — without a developer
or a redeploy. Changes appear on the public site (`www.edubridgeacademy.com`) within
seconds of publishing.

This is a **new, separate project** from the public marketing site. It lives on its own
URL (`admin.edubridgeacademy.com`) with its own deployment, secrets, and login.

> **Status:** design approved, not yet built. Start here, then plan and implement.

---

## Start here (new Claude Code session)

1. **Read the spec:** [`docs/SPEC.md`](docs/SPEC.md) — the full approved design
   (architecture, content model, screens, auth, rollout, testing).
2. **See the intended look:** open [`design/mockup.html`](design/mockup.html) in a browser
   — the light "command console" direction (sidebar, dashboard, program editor).
3. **Then plan:** turn the spec into an implementation plan before writing code
   (e.g. the Superpowers `writing-plans` skill), and get it approved.

---

## What this portal does (scope)

For each of the 6 learner programs (Corporate Training is out of scope):

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

- [ ] Plan the build from `docs/SPEC.md` and get it approved.
- [ ] Scaffold the Next.js app + Auth.js (Google) + Vercel Blob.
- [ ] Seed `content.json` from the public site's current data; parity-check.
- [ ] Build dashboard + program editor (cohorts / pricing / image) + review-and-publish.
- [ ] Add the runtime overlay to the public site (separate PR in the public repo).
- [ ] Repoint the Apps Script win-back automation to the Blob cohorts feed.
- [ ] Set up the new GitHub repo + Vercel project + `admin.edubridgeacademy.com`.
