# Plan 2 — Public site reads the portal (design)

Status: agreed in brainstorm 2026-10-23. Builds on `docs/SPEC.md` §2–3 and §7 (the "overlay"), which this
document refines with the owner's decisions and what the website code actually looks like today.

## Why

Staff now edit cohort dates, seats, prices and landing images in the live admin portal
(`admin.edubridgeacademy.com`), but `www.edubridgeacademy.com` still shows the values baked into its code.
Today a date change means editing `data.json` and redeploying the website (the Vercel history is full of
"close Q4 2026, open 23 Jan 2027" content deploys). Plan 2 makes the website show what staff publish, with no
developer and no redeploy, while never letting a portal problem break the site.

It also fixes the long-standing "issue #5": next-cohort labels are typed by hand and drift. On 2026-10-23 the
homepage hero still advertises HR "22 August 2026" and Data School "5 September 2026", both in the past.

## Decisions made with the owner (2026-10-23)

| Topic | Decision |
|---|---|
| Freshness | Published changes appear on the website **within about 5 minutes** (comfortably inside Hobby Blob limits). |
| Rollout | **Invisible first**: release while the store holds what the site shows today, confirm nothing unexpected changed, *then* tell staff to start editing. |
| Approval | The owner reviews a **private Vercel preview link** before anything reaches production. |
| Hero slideshow | Its "Next cohort" dates come from the portal, and a **Securities Trading slide is added**. |
| Calendar page | Shows **all 7 programs** with portal dates (Securities Trading is missing today). |
| Win-back feed | `www.edubridgeacademy.com/cohorts.json` **serves the portal's live `cohorts-feed.json`**, so the Apps Script needs no change. This replaces most of the old "Plan 3". |
| Fallback | If the portal can't be reached, the site uses built-in values, which are **refreshed from the portal on every website release**. |
| Loading | Dates/prices/seats show a **brief placeholder**, then the portal's values; if the portal hasn't answered within **~1.5 s**, built-in values are shown. A visitor never sees an old value swap to a new one. |
| Prices charged | Unchanged mechanism: the Apps Script charges from the Google Sheet's **Programs tab** (`total_price`, `part_payment_*_amount`) and that tab's Paystack links. **Staff update the Sheet and Paystack when they change a price in the portal**; the portal's Pricing warning is strengthened to say so. Automating it is a possible later project. |
| Release | The owner **promotes the approved preview to production** in the Vercel dashboard ("Promote to Production"), so what goes live is exactly what was checked. No CLI needed. |
| Plan | Vercel **Hobby** (owner's choice, recorded in Plan 1). |

## Current state (recon of `ea-website-revamp`, 2026-10-23)

- **Stack:** Vite + React 19 single-page app, react-router 7, Tailwind 4. No test runner yet.
  `npm run build` = `prebuild` (`scripts/generate-cohorts-feed.mjs` → `public/cohorts.json`) + `tsc -b && vite build`.
- **Data:** each program's content is `product/sections/<slug>/data.json`, imported statically by its
  `*Preview.tsx` (program pages) and passed down as props.
- **Where editable values appear:**
  1. Program pages, 7 (`src/sections/<slug>/components/<Name>Page.tsx`): `heroContent.nextCohortLabel`,
     `heroContent.priceLabel`, the cohort list, pricing cards, and default cohort selection via `getCohortStatus`.
  2. Enrolment forms, 7 (`…/components/EnrollmentForm.tsx`): cohort `<select>` from the page's `cohorts`. The
     posted `cohortId`/`cohortDate` go to the Apps Script.
  3. Homepage program cards and the Programs page (`home/data.json` → `featuredPrograms`: `imageUrl`, `price`,
     `currency`, `nextCohort` month).
  4. Homepage hero slideshow (`home/data.json` → `heroContent.slides[].nextCohort`, hand-typed, 6 slides, no
     Securities Trading).
  5. Calendar (`src/sections/calendar/CalendarPreview.tsx`): imports 6 programs' `cohorts`; Securities Trading
     is missing.
- `src/lib/cohort-status.ts` is byte-identical to the portal's copy (the portal comment says to keep them in sync).
- **Deployment:**
  - Production releases are **CLI deploys** (`>_` in Vercel) from branch **`feat/onboarding-form`**.
  - Every **git push creates a Preview** deployment automatically.
  - `main` is **16 commits behind** what is live.
  - `feat/onboarding-form` has **ongoing work by another session**.
- `vercel.json` has security headers and an SPA catch-all rewrite. There is no CSP.
- **Blob store:** the production store `edubridge-content` (public, iad1).
  - Public Blob URLs send `Access-Control-Allow-Origin: *`, so the browser can read `content.json` directly.
  - `cohorts-feed.json` has exactly the shape `public/cohorts.json` has today (`{ programs: { <slug>: { url,
    cohorts: [{ id, name, startDate, endDate }] } } }`). The Apps Script `fetchCohortFeed()` only needs
    `parsed.programs` and per-program `cohorts[].startDate`.

## Goals

1. Every surface listed above shows the portal's published values within ~5 minutes of publishing.
2. Derived labels are computed from cohorts, never typed: the hero "Next cohort starts …", the card and slide
   month, and the card price. They use the **same rules the portal shows staff** in its "Program page will show"
   preview: the earliest open cohort; "New cohort dates coming soon" / `null` when none is open.
3. The site works identically when the store is unreachable, slow or malformed: built-in values, no blank
   sections, no errors.
4. `/cohorts.json` always reflects the portal's feed.
5. The website's built-in fallback values are refreshed from the store at each release.

## Non-goals

- Editing anything on the website itself.
- Moving any other content (copy, FAQs, testimonials, SEO) into the portal.
- Corporate Training (stays in code).
- Changing the Apps Script.
- Server-side rendering or prerendering changes.
- Retiring the CLI deploy habit (out of scope; documented below).

## Anti-goals (failure even if it "works")

- Any page blank, broken or erroring because the store is down, slow, or returns bad data.
- A visitor seeing an old date or price flick to a new one.
- A website build or deploy failing because the portal store can't be reached.
- An image loaded from anywhere but this store's `images/` folder (or the site itself).
- Undoing or clashing with the ongoing `feat/onboarding-form` work.
- Running past Hobby limits silently: the design must stay well inside 10k simple Blob operations/month.

## Design

### A. Portal (this repo): small changes

1. `content.json` and `cohorts-feed.json` are written with `cacheControlMaxAge: 300` (was 60), which gives the
   agreed ~5 min freshness and caps CDN refetches. The portal's own reads use version files and `head()`, so
   this doesn't affect staff.
2. **Pricing warning:** the Pricing tab's callout currently says "Changing an amount here does **not** change the
   Paystack payment page…". It must also name the **Google Sheet's Programs tab**, because the Apps Script
   charges `total_price` / `part_payment_first_amount` / `part_payment_second_amount` from there. Proposed copy:
   "Changing a price here updates the website only. People are charged from the Google Sheet's **Programs** tab
   and the Paystack payment page, so update both too, or learners will be charged the old price."
3. No other portal change. The image-ownership rule already guarantees new images are this store's.

### B. Website: content loader and overlay (new, self-contained)

- **`src/lib/portal-content.ts`** (or similar), with no React dependencies:
  - `loadPortalContent(url, { timeoutMs: 1500 })`: a single shared fetch per page load (module-level
    promise). On timeout, network error, non-200, or failed validation it resolves to `null`. It never throws.
  - Light runtime validation of the shape: `programs[slug].cohorts[]` with string ISO dates and numeric seats,
    `pricing[]` with `id/priceLabel/amount`, `heroPriceLabel`, `landingImageUrl`. Malformed **per program** →
    that program keeps built-in values; others still overlay (spec §3 "a program missing or malformed keeps its
    defaults").
  - `landingImageUrl` is only accepted if it is `https://<store host>/images/…`; otherwise the built-in image is
    used.
- **Overlay functions** (pure, testable):
  - `overlayProgram(defaults, entry)`: replaces `cohorts`, `pricing` and `heroContent.priceLabel` wholesale, and
    derives `heroContent.nextCohortLabel`.
  - `overlayHomeCards(cards, content)`: `imageUrl`, `price` (from the `full` option's `amount`), and `nextCohort`
    month (or `null`).
  - `overlayHeroSlides(slides, content)`: each slide's `nextCohort` (keyed by the slide's `href` → program).
  - Calendar input: all 7 programs.
  - **Derivation port:** copy the portal's `src/lib/next-cohort.ts` rules (`nextOpenCohort`,
    `heroNextCohortLabel`, `cardNextCohort`) so portal preview and website agree. Add a "keep in sync" comment
    like `cohort-status.ts` has.
- **React integration:** a small hook/provider (e.g. `usePortalContent()`), used where each surface reads its
  data.
  - `*Preview.tsx` for program pages and forms, `HomePreview`/`ProgramsPreview`, `HeroSection`, `CalendarPreview`.
  - While loading (≤1.5 s), **only the editable fields** render a placeholder (a skeleton/grey bar). The rest of
    the page renders immediately.
  - The enrolment form's cohort list must not let anyone submit until content is resolved, whether from the
    portal or the fallback.
- **Config:** `VITE_PORTAL_CONTENT_URL` = the production store's `https://<store>.public.blob.vercel-storage.com/content.json`.
  This is public, not a secret. Missing env → loader disabled → built-in values (so local dev and forks work
  unchanged).

### C. Website: hero slide and calendar

- Add a **Securities Trading slide** to `home/data.json` `heroContent.slides`: title, `href: /securities-trading`,
  and a background image using the existing Securities Trading hero photo in `public/images/`.
  - Its `nextCohort` is derived like the others.
  - `HeroSection` uses `max(bgImages.length, slides.length)`, so check that the image/slide pairing still lines up.
- `CalendarPreview` imports Securities Trading's `data.json` too and feeds all 7 through the overlay.

### D. Website: `/cohorts.json` serves the portal feed

- Add a `vercel.json` rewrite from `/cohorts.json` to the production store's `cohorts-feed.json` URL, placed
  **before** the SPA catch-all.
- Vercel serves real files before rewrites, so **`public/cohorts.json` must stop being produced and deployed**.
  Remove it from `public/` and change the `prebuild` step (see E).
- Verify with `curl https://www.edubridgeacademy.com/cohorts.json` that the body is the portal feed, including
  `securities-trading`, and that `UrlFetchApp`-style requests get 200 JSON.

### E. Website: fallback refreshed at release

- Replace the `prebuild` feed generator with a **"refresh fallback"** step:
  - It fetches `content.json` from the store and writes `src/generated/portal-fallback.json` (git-ignored).
  - The loader uses that file as its fallback, falling back to the committed `data.json` values when it's absent.
- The step must **never fail the build**: if the store is unreachable it logs a warning and leaves the previous
  or absent file.
- Committed `data.json` files stay the ultimate fallback and the source for non-editable content.

### F. Hobby limits

- Browsers fetch `content.json` (≈12 KB) on pages that show editable values. With `max-age=300`, each CDN
  location refetches at most every 5 minutes, which is ≤~8,600 simple ops/month per location at constant
  traffic. Real traffic (~6.4k analytics events/month today) sits well under the 10k cap.
- Images are immutable, hashed and cached for a year.
- The Apps Script fetches the feed a few times a day.
- If the cap is ever hit, Blob stops serving; the loader falls back and the site keeps working with release-time
  values. Watch usage on the store page.

## Rollout (owner approves each outward step)

1. Build on a new branch **from `feat/onboarding-form`** (what's live), not `main`. Keep changes self-contained
   to minimise conflicts with the ongoing work there.
2. Push → automatic **Vercel Preview**.
   - The owner clicks through: home (hero slides incl. Securities Trading, cards), Programs, all 7 program
     pages, an enrolment form's cohort list, and Calendar.
   - Expected visible differences only: corrected hero-slide/card next-cohort labels, the new Securities Trading
     slide, and Securities Trading on the calendar. Everything else is identical.
   - Also test with the store URL deliberately broken, so the fallback shows.
3. Coordinate with the other session's branch: bring in its latest changes, then merge this work into the branch
   that production deploys from.
4. **Production release:** after the owner's OK, the owner clicks **Promote to Production** on the approved
   preview in the Vercel dashboard. Promote the preview built from the merged branch, so it includes the other
   session's work. Then verify:
   - live pages;
   - `curl /cohorts.json`;
   - an Apps Script dry run if available (`fetchCohortFeed()` returns programs).
5. Tell staff they can now edit in the portal. Then do a real end-to-end check: publish a seat change, and see
   it on the site within ~5 minutes.

## Testing

- **Add Vitest to the website** (dev dependency).
- **Unit tests:**
  - overlay replaces exactly the three sub-objects;
  - derivation agrees with the portal on shared fixtures (the same dates produce the same labels);
  - a program missing or malformed falls back alone;
  - a foreign image host is rejected;
  - loader timeout, network error and bad JSON all → `null`;
  - hero-slide and card overlays;
  - the calendar includes 7 programs.
- **Parity check:** with today's store content, every overlaid program equals its built-in `data.json`
  (editable fields). Labels differ only where the built-in label is stale, and those cases are listed.
- **Manual (preview):** the walkthrough in Rollout step 2, plus the forced-outage run.

## Calls I made (owner can overturn)

- **Read `content.json` from the browser directly.** Blob allows it via CORS. A server function in front would
  add complexity without reducing Blob reads.
- **5-minute cache:** set by the portal's `cacheControlMaxAge: 300`, which also applies to the feed.
- **Placeholder only on editable fields;** the 1.5 s timeout before falling back.
- **Generated fallback file** rather than rewriting committed `data.json` at build time.
- **Securities Trading slide image:** the existing Securities Trading hero photo.
- **Design doc location:** this repo (where the project's designs live); the code goes in `ea-website-revamp`.

## Left to the builder

- Exact hook/provider shape, placeholder styling, and file names.
- How each `*Preview.tsx` threads overlaid data.
- Wiring Vitest into the website's toolchain.
- Getting the production store host. It's in production `content.json`'s image URLs, or on the Vercel store
  page; it is not a secret.
