# Analytics page — design

Status: agreed in brainstorm 2026-10-23. Build **after** the admin portal goes live (after plan Task 18).

## Why

The EduBridge team wants one place to see how each program is doing without opening
Vercel and the signups spreadsheet separately: how many people visit each program page,
how many sign up, how many actually pay, and how that moves day by day.

## What the page shows (agreed with the user)

1. **Signed up and paid, both, per program and per cohort.** "Signed up" = a row in the
   Learner Signups sheet. "Paid" = `payment_status` is `paid` (Paystack webhook or a
   bank transfer marked by hand).
2. **Visitors**: site-wide and per program page.
3. **Day-by-day trends**: a daily chart of visitors, sign-ups and payments.
4. **Counts and totals only.** No names, emails, phone numbers or free-text messages,
   ever, for any admin. (User decision.)

## Anti-goals

- The portal never writes to the Sheet or to Vercel. Apps Script stays the only writer.
- No personal data leaves Google: the portal does not even download the personal columns
  (see "Data sources"). A leak of the portal's cache or logs must not expose a learner.
- No made-up numbers: if a source is unavailable, that section says so; nothing is estimated.

## Data sources

### Learner Signups sheet (Google Sheets API, read-only)

Spreadsheet "EduBridge Academy — Signups & …", tab `Learner Signups`, written by
`ea-website-revamp/apps-script/Code.gs` (`appendSignupRow`). Relevant columns, located by
**header name** (the Apps Script itself warns columns have moved before):

| header | use |
|---|---|
| `created_at` | sign-up day |
| `program_id` | program slug (same six slugs as `src/lib/programs.ts`) |
| `cohort_id`, `cohort_date` | per-cohort counts |
| `payment_option` | full vs installments split |
| `payment_status` | `paid` → counts as paid |
| `total_amount`, `amount_paid`, `outstanding_balance` | money collected / still owed |
| `first_payment_date` | payment day for the daily chart |
| `utm_source`, `utm_medium`, `utm_campaign`, `source_page` | optional "where sign-ups came from" |

Fetch the header row first, then request **only** the columns above by letter
(`values.batchGet`). `full_name`, `email`, `phone`, `message` and every other column are
never requested.

Access: a Google service account with **Viewer** access to the spreadsheet (the user shares
the sheet with the service account's email). Key in a server-only env var
(`GOOGLE_SERVICE_ACCOUNT_KEY`), never in client code, never committed.

Known data behaviours the numbers must respect:
- **Win-back** moves unpaid registrants to the next cohort (changes `cohort_id`), so
  per-cohort counts reflect where a person is *now*, not where they first signed up.
  Label the per-cohort table accordingly.
- Rows for programs outside the six (e.g. `securities-trading`) count in site totals under
  "Other programs" and are not dropped silently.

### Vercel Web Analytics (REST API, read-only)

The public site already loads `@vercel/analytics` (`ea-website-revamp/src/main.tsx`).
The portal calls `GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate`
with `by=day` for the daily chart, `filter=requestPath eq '/data-school'` etc. for per-program
pages (paths from `PROGRAMS[].href`), and `by=referrerHostname` for traffic sources.
Token: a Vercel access token scoped to the team, in server-only `VERCEL_ANALYTICS_TOKEN`,
plus `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID`.

**To confirm before building:** that the user's Vercel plan exposes the Web Analytics
query API for the `ea-website-revamp` project (a single test call settles it).

## Page layout

A new **Analytics** item in the sidebar, beside Programs and Publish history.

- Top: stat cards in the same style as the Programs dashboard — Visitors, Signed up,
  Paid (each with change vs the previous period), Collected (₦), Still owed (₦).
- A range picker: last 7 days / last 30 days / last 90 days.
- A daily line chart: visitors, sign-ups, payments.
- A per-program table: page visitors, signed up, paid, visit→sign-up %, sign-up→paid %,
  collected. Selecting a program shows its per-cohort breakdown.
- "Updated N min ago" and a per-source error state.

## Freshness and failure

- Results cached server-side for ~15 minutes (both sources); the page shows the age.
- Each source is fetched independently; one failing does not blank the page.
- Respect API rate limits; no fetch per page view beyond the cache.

## Security

- Both credentials are server-only env vars, read in server code only; never sent to the
  browser, never logged.
- The Analytics route sits behind the same `requireAdmin` allowlist as the rest of the portal.
- Cached data holds aggregates only.

## My calls (not discussed — the user can overturn)

- Google Sheets API with a service account rather than a new Apps Script read endpoint
  (keeps Apps Script untouched; read-only by construction).
- **"Paid" includes installment payers who have made their first payment** (`payment_status`
  is `paid` *or* `amount_paid` > 0). Someone halfway through installments is a paying learner.
- **Collected and Still owed are current totals, not per-period**: the sheet records how much
  each person has paid in total, not when each installment landed, so a "collected this week"
  figure would misplace second installments. These two cards show no change badge.
  Signed up / Paid follow the range (by `created_at` / `first_payment_date`).
- "Visitors" means Vercel's unique visitors, not page views.
- 15-minute cache; 7/30/90-day ranges.
- Days counted in Lagos time.
- Chart drawn with a small charting library chosen at plan time, styled to the portal's tokens.

## Later ideas (not in v1)

Cohorts at risk (starting soon, under half full), traffic sources table, abandoned
enrolment forms, a weekly summary email, signed-up/paid figures on the Programs dashboard.
