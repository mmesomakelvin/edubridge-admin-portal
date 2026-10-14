# EduBridge Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the separate Next.js admin portal that lets the shared EduBridge admin Google account edit cohort dates/seats, pricing and the homepage card image for the 6 learner programs, and publish them to a Vercel Blob content store (plus the derived win-back cohort feed) with conflict protection and one-click rollback.

**Architecture:** Next.js 16 App Router app. All business rules (validation, cohort status, plain-language diff, feed building, publish/rollback) live in pure, unit-tested modules under `src/lib/` that talk to storage only through a small `ContentStore` interface. There are two implementations: Vercel Blob for real use, and in-memory for tests and a local demo mode. Pages and server actions are thin: check the session, call the lib, render. The UI is a three-pane console (sidebar · list · detail/review panel) modelled on the user's reference design.

**Tech Stack:** Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3, Auth.js (`next-auth@5.0.0-beta.32`) with Google, `@vercel/blob@2.8.2`, `sharp@0.35.5`, `zod@4.6.7`, `lucide-react@1.57.0`, Vitest 4.1.11, `tsx@4.23.15`. Plain CSS (tokens from `design/mockup.html`), Poppins via `next/font`.

**Spec:** [`docs/SPEC.md`](../../SPEC.md)

**Visual reference:** the clickable design preview at https://claude.ai/artifact/7i97w6XSyRNAxaRvNesS9t (built from real site data on 2026-10-14) and `design/mockup.html` for tokens. The three-pane layout comes from the user's Pinterest reference (a "package delivery tracker" dashboard). Its parts map as follows:

| Reference | Portal |
|---|---|
| Left sidebar: profile on top, nav, "Recent reports" at bottom | Account on top, **Programs** / **Publish history**, "Recent publishes" at bottom, View live site + Sign out |
| Centre list of rounded row cards: thumb · name/sub · qty chip · date · status pill; selected row outlined | Program rows: card image · name/"N cohorts on file" · price chip · next start · Open/Full/No upcoming pill; selected row has green ring |
| Right detail panel: big image, two-column label/value grid, two buttons pinned at bottom | Program summary (next cohort, seats left, prices, hero label, what the page will show) + **View live page** / **Edit program**; in the editor the same panel becomes **Review changes** with **Discard** / **Review & publish** |

**Scope of this plan (Plan 1 of 3).** This repo only. Two follow-up plans are written after this ships:
- **Plan 2 (public repo `ea-website-revamp`):** runtime overlay that reads `content.json`, derives next-cohort text, falls back to build-time data. It must re-validate what it reads (same zod schema + `isSafeImageUrl`) before rendering, so even a compromised admin account cannot inject a script URL into the public site.
- **Plan 3 (public repo `apps-script/Code.gs`):** repoint `COHORT_FEED_URL` to the Blob `cohorts-feed.json` and verify end-to-end.

Until Plan 2 ships, publishing from the portal updates the store but the public site does not read it yet. That is the intended "Phase 1 — public untouched" rollout step (spec §7).

**Deliberate refinements of the spec (all within its intent):**
- Env names follow Auth.js v5 conventions: `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (spec says `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`).
- Max upload is **4 MB** (spec "≈5 MB") because Vercel functions reject request bodies over 4.5 MB.
- The conflict guard checks `version` **and** writes with Blob `ifMatch` (etag). A race between two publishes can never silently overwrite.
- The seed uploads today's card images **byte-for-byte** (no re-encode) so the parity check proves zero visible change. Only *new* uploads are re-encoded to WebP.
- The win-back feed uses each program's real page URL. The current `public/cohorts.json` links consulting to `/school-of-mgmt-consulting`, which isn't a route; the new feed uses `/school-of-management-consulting`.
- A **local demo mode** (`ADMIN_DEMO=1`, impossible in production builds) runs the full UI against an in-memory store seeded from the public repo, so screens can be shown before Google/Blob credentials exist.

## Global Constraints

- Node ≥ 20.9 (dev machine has 24.12.0). Pin exact dependency versions listed in Tech Stack.
- Programs: exactly these 6 folder slugs, in this order: `school-of-finance`, `data-school`, `school-of-mgmt-consulting`, `advanced-financial-modeling`, `school-of-hr-and-analytics`, `project-finance-modeling`. Corporate Training is out of scope.
- Allowlist: `ALLOWED_EMAILS` (comma-separated, case-insensitive), initially `hello@edubridgeacademy.com`. Google `email_verified` must be `true`.
- `content.json` and `cohorts-feed.json` are written with `cacheControlMaxAge: 60`; staff-facing copy says "within about a minute".
- All Blob writes happen server-side. No secret ever reaches client code. `BLOB_READ_WRITE_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET` are server-only.
- Pricing options are **edited, never added or removed** (`id`s `full` / `installments` drive the public enrolment form's `programTotal`).
- Copy is for non-technical staff: plain words, dates like `23 Jan 2027`, money like `₦175,000`, errors say what to fix.
- Visual language: Poppins (matches the live site); semantic colour tokens from the EduBridge Brand Style Guide 2025 (Task 1); light only; three-pane console; usable at 390 px wide.
- Colour rules: brand green `#5EB229` and gold `#F2C94C` never carry text (fail contrast); success = deep green, warning = gold family, info = navy, unpublished/draft = plum, danger = red (the only non-brand colour, errors and destructive actions only).
- XSS: never render HTML from data (`dangerouslySetInnerHTML`, `innerHTML`, `eval` are banned and tested); image URLs must pass `isSafeImageUrl`; every page ships a nonce-based CSP.
- Show-before-deploy: nothing is pushed to GitHub, deployed, or written to the production Blob store without the user's explicit OK at that moment.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A seat or amount box left empty** → publish is blocked with "must be a whole number", and `null`/`NaN` never reaches the store. Test in Task 4 (`rejects blank seat numbers`) and Task 13 (`keeps a cleared number as NaN so validation catches it`).
2. **Both password-holders publish at nearly the same moment** → the second gets "updated in another session — reload" and nothing is overwritten. Tests in Task 8 (`stale baseVersion` and `another publish lands mid-write`).
3. **Impossible or half-typed dates** (`2026-02-30`, blank date on a new cohort) → field error, never a cohort that silently shows as "Open". Tests in Task 4 (`rejects impossible dates`) and Task 3 (`ignores cohorts with unset dates`).
4. **Feed write fails after content is saved** → staff see "Published, but the win-back feed didn't update", and the next publish rewrites the feed. Test in Task 8 (`still publishes when the feed write fails`).
5. **Wrong file dropped on the image tab** (PDF renamed `.jpg`, GIF, 12 MB photo, tiny 600×400 logo) → friendly rejection, nothing stored. Tests in Task 9.

---

## File map

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts, .env.example, .gitignore
src/
  auth.ts                         Auth.js config (Google + allowlist)
  proxy.ts                        Route protection (Next 16 "proxy", formerly middleware)
  app/
    layout.tsx, globals.css       Root layout, fonts, all styles
    login/page.tsx                Sign-in screen
    actions.ts                    Server actions: publish, rollback, sign out
    api/auth/[...nextauth]/route.ts
    api/images/route.ts           Image upload (auth-checked)
    (console)/layout.tsx          Auth gate + sidebar
    (console)/page.tsx            Programs dashboard (list + detail)
    (console)/programs/[slug]/page.tsx   Program editor
    (console)/history/page.tsx    Publish history + rollback
  components/
    Sidebar.tsx, StatusPill.tsx, ProgramRow.tsx, ProgramDetail.tsx, NotSeeded.tsx, RollbackButton.tsx
    editor/ProgramEditor.tsx, CohortsTab.tsx, PricingTab.tsx, ImageTab.tsx, ReviewPanel.tsx, FieldError.tsx
  lib/
    programs.ts         Fixed registry of the 6 programs
    content-schema.ts   zod schemas + types for content.json
    dates.ts, format.ts Date validity, today, display formatting
    cohort-status.ts    Ported verbatim from the public site
    next-cohort.ts      Next open cohort, hero/card labels, dashboard pill
    validate.ts         Business validation → field issues
    cohort-ids.ts       Names/ids for newly added cohorts
    diff.ts             Plain-language change list
    cohorts-feed.ts     Win-back feed builder
    store.ts            ContentStore interface, paths, backup naming
    memory-store.ts     In-memory store (tests + demo)
    blob-store.ts       Vercel Blob store
    store-instance.ts   Server-only singleton (Blob, or demo memory store)
    publish.ts          publishProgram + rollbackLastPublish
    hash.ts, image.ts   Image validation + re-encode
    seed.ts             Seed + parity from the public repo
    allowlist.ts, demo.ts, session.ts
    csp.ts              Content Security Policy + security headers
    draft-reducer.ts    Editor state transitions
scripts/seed.ts, scripts/parity.ts
tests/*.test.ts, tests/fixtures.ts
```

---

### Task 1: Scaffold the Next.js app, tooling and base styles

**Files:**
- Create: `package.json` (via npm), `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx` (temporary), `src/app/globals.css`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run dev|build|start|typecheck|test|seed|parity`; `@/*` → `src/*` alias in TS and Vitest; CSS tokens and `.btn`, `.pill`, `.banner`, `.meta`, `.muted`, `.sr-only` classes used by every later UI task.

- [ ] **Step 1: Create package.json and install pinned dependencies**

```bash
cd /c/Users/okoro/Documents/edubridge-admin-portal
npm init -y >/dev/null
npm pkg delete main scripts.test
npm pkg set name=edubridge-admin-portal private=true type=module engines.node=">=20.9" \
  scripts.dev="next dev" scripts.build="next build" scripts.start="next start" \
  scripts.typecheck="tsc --noEmit" scripts.test="vitest run" scripts.test:watch="vitest" \
  scripts.seed="tsx --env-file=.env.local scripts/seed.ts" \
  scripts.parity="tsx --env-file=.env.local scripts/parity.ts"
npm install --save-exact next@16.4.0 react@19.3.0 react-dom@19.3.0 next-auth@5.0.0-beta.32 \
  @vercel/blob@2.8.2 sharp@0.35.5 zod@4.6.7 lucide-react@1.57.0 server-only@0.0.1
npm install --save-exact --save-dev typescript@5.9.3 @types/node@24 @types/react@19.3.0 \
  @types/react-dom@19 vitest@4.1.11 tsx@4.23.15
```

Expected: install succeeds; `package.json` lists exact versions.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.ts` and `vitest.config.ts`**

`next.config.ts`:
```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  // sharp is a native module; keep it out of the server bundle.
  serverExternalPackages: ['sharp'],
}

export default config
```

`vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 4: Write `.env.example` and extend `.gitignore`**

`.env.example`:
```bash
# Google OAuth client (Auth.js v5 reads these names automatically).
# Redirect URIs: http://localhost:3000/api/auth/callback/google
#                https://admin.edubridgeacademy.com/api/auth/callback/google
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
# Generate with: npx auth secret   (or: openssl rand -base64 32)
AUTH_SECRET=
# Comma-separated, case-insensitive.
ALLOWED_EMAILS=hello@edubridgeacademy.com
# Vercel Blob read-write token. Use a separate *dev* store locally.
BLOB_READ_WRITE_TOKEN=

# Local demo only (ignored by production builds): in-memory store seeded from the public repo.
# ADMIN_DEMO=1
# DEMO_PUBLIC_REPO=C:\Users\okoro\Documents\EA Website Revamp\ea-website-revamp
```

Append to `.gitignore`:
```
next-env.d.ts
*.tsbuildinfo
```

- [ ] **Step 5: Write `src/app/globals.css` (tokens + shared primitives)**

```css
/* Colours: EduBridge Brand Style Guide 2025 (p.5 palette, p.7 greys) mapped to semantic roles.
   Rule: brand green and gold are too light for text on white (2.7:1, 1.6:1) — use them only for
   dots, borders, rings and fills. Every text/background pair below passes WCAG AA (≥ 4.5:1). */
:root {
  /* Brand palette */
  --brand-teal: #154b54; --brand-green: #5eb229; --brand-navy: #040084; --brand-green-deep: #016938;
  --brand-yellow: #ffe76c; --brand-gold: #f2c94c; --brand-plum: #4a154b;
  --grey-900: #1a1a1a; --grey-700: #595959; --grey-500: #737373; --grey-300: #b3b3b3;

  /* Surfaces + text */
  --bg: #ffffff; --canvas: #f7f9fa; --panel: #ffffff; --panel-2: #f3f6f7; --raise: #e7ecee;
  --border: #dfe6e8; --border-soft: #eaeef0; --hair: #edf1f2;
  --fg: #13232a; --muted: #55676e; --faint: var(--grey-500);
  --ink: var(--brand-teal);                       /* headings accents, avatar */

  /* Semantic roles */
  --primary: var(--brand-green-deep); --primary-hover: #015a30; --on-primary: #ffffff;  /* 6.8:1 */
  --accent: var(--brand-green);                   /* focus ring, active rail — never text */
  --success-fg: var(--brand-green-deep); --success-bg: #eaf6e1; --success-border: #bfe3a6;   /* 6.1:1 */
  --warning-fg: #6b5200; --warning-bg: #fff6c7; --warning-border: var(--brand-gold);       /* 6.8:1 */
  --danger-fg: #b42318; --danger-bg: #fdecea; --danger-border: #f1c2bd;                   /* 5.8:1 */
  --info-fg: var(--brand-navy); --info-bg: #ecebfa; --info-border: #c9c7f0;               /* 13.3:1 */
  --draft-fg: var(--brand-plum); --draft-bg: #f4eaf4; --draft-border: #dcc3dc;            /* 12.0:1 */
  --neutral-fg: var(--grey-700); --neutral-bg: #f0f2f2;                                   /* 6.2:1 */
  /* Danger red is the only colour outside the brand palette: errors and destructive actions only. */

  /* Status aliases used by components */
  --open-bg: var(--success-bg); --open-fg: var(--success-fg);
  --full-bg: var(--warning-bg); --full-fg: var(--warning-fg);
  --ended-bg: var(--neutral-bg); --ended-fg: var(--neutral-fg);
  --danger: var(--danger-fg);
  --green: var(--accent); --green-deep: var(--primary); --green-hover: var(--primary-hover); --teal: var(--ink);

  --ring: 0 0 0 3px rgba(94, 178, 41, 0.22);
  --shadow: 0 1px 2px rgba(19, 35, 42, 0.05), 0 14px 30px -18px rgba(19, 35, 42, 0.28);
  --shadow-sm: 0 1px 2px rgba(19, 35, 42, 0.06);
  --radius: 14px;
  --font: var(--font-poppins), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; background: var(--canvas); color: var(--fg); font-family: var(--font);
  font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { margin: 0; font-weight: 600; letter-spacing: -0.015em; text-wrap: balance; }
p { margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.meta { font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 16px;
  border-radius: 10px; border: 1px solid transparent; background: none; font-weight: 600; font-size: 13.5px;
  text-decoration: none; cursor: pointer; white-space: nowrap;
  transition: background .15s, border-color .15s, box-shadow .15s, color .15s;
}
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn-primary { background: var(--green-deep); color: #fff; }
.btn-primary:not(:disabled):hover { background: var(--green-hover); box-shadow: var(--ring); }
.btn-outline { background: var(--panel); border-color: var(--border); color: var(--fg); }
.btn-outline:not(:disabled):hover { border-color: var(--green); color: var(--green-deep); }
.btn-danger { background: var(--panel); border-color: var(--danger-border); color: var(--danger); }
.btn-danger:not(:disabled):hover { background: var(--danger-bg); }
.btn-ghost { color: var(--muted); }
.btn-ghost:hover { color: var(--fg); background: var(--panel-2); }

.pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.pill::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.pill-open { background: var(--open-bg); color: var(--open-fg); }
.pill-full { background: var(--full-bg); color: var(--full-fg); }
.pill-ended, .pill-none { background: var(--ended-bg); color: var(--ended-fg); }

.banner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 14px; border-radius: 12px; font-size: 13px; margin-bottom: 16px; }
.banner a { font-weight: 600; }
.banner-ok { background: var(--success-bg); color: var(--success-fg); }
.banner-warn { background: var(--warning-bg); color: var(--warning-fg); }
.banner-error { background: var(--danger-bg); color: var(--danger-fg); }
.banner-info { background: var(--info-bg); color: var(--info-fg); }
.chip-draft { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; background: var(--draft-bg); color: var(--draft-fg); border: 1px solid var(--draft-border); }
```

- [ ] **Step 6: Write the root layout and a temporary home page**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Poppins } from 'next/font/google'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EduBridge Admin',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  )
}
```

`src/app/page.tsx` (deleted in Task 12):
```tsx
export default function Home() {
  return (
    <main style={{ padding: 32 }}>
      <h1>EduBridge Admin</h1>
      <p className="muted">Scaffold is running.</p>
    </main>
  )
}
```

- [ ] **Step 7: Verify build, typecheck and test runner**

Run: `npm run build && npm run typecheck && npx vitest run --passWithNoTests`
Expected: build succeeds (Next may rewrite `tsconfig.json`; keep its edits), typecheck clean, Vitest exits 0 with "No test files found".

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js 16 app with Vitest and base styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Program registry and content schema

**Files:**
- Create: `src/lib/programs.ts`, `src/lib/content-schema.ts`, `tests/fixtures.ts`
- Test: `tests/programs-schema.test.ts`

**Interfaces:**
- Produces:
  - `PROGRAM_SLUGS` (readonly tuple), `type ProgramSlug`, `interface ProgramInfo { slug: ProgramSlug; name: string; href: string; homeCardId: string }`, `PROGRAMS: readonly ProgramInfo[]`, `PUBLIC_SITE_URL`, `getProgram(slug: string): ProgramInfo | undefined`, `isProgramSlug(s: string): s is ProgramSlug`, `liveUrl(p: ProgramInfo): string`
  - `COHORT_FORMATS`, `type CohortFormat`, `CohortSchema`, `PricingOptionSchema`, `ProgramContentSchema`, `ContentSchema`, `type Cohort`, `type PricingOption`, `type ProgramContent`, `type Content` (`programs: Record<string, ProgramContent>`)
  - Test fixtures: `NOW`, `cohort(over?)`, `program(over?)`, `content(over?)`

- [ ] **Step 1: Write test fixtures**

`tests/fixtures.ts`:
```ts
import type { Cohort, Content, ProgramContent } from '@/lib/content-schema'

/** Fixed "today" for every date-sensitive test: 14 Oct 2026, midday UTC. */
export const NOW = new Date('2026-10-14T12:00:00Z')

export function cohort(over: Partial<Cohort> = {}): Cohort {
  return {
    id: 'cohort-2027-q1',
    name: 'Q1 2027 Cohort',
    startDate: '2027-01-23',
    endDate: '2027-03-21',
    format: 'hybrid',
    seatsRemaining: 20,
    totalSeats: 50,
    ...over,
  }
}

export function program(over: Partial<ProgramContent> = {}): ProgramContent {
  return {
    cohorts: [cohort()],
    pricing: [
      {
        id: 'full',
        title: 'Pay in full',
        priceLabel: '₦175,000',
        amount: 175000,
        description: 'Single payment due on enrollment confirmation.',
        highlights: ['Lowest total cost'],
        recommended: true,
      },
      {
        id: 'installments',
        title: '2 installments',
        priceLabel: '2 × ₦87,500',
        amount: 87500,
        description: 'First installment on enrollment, second due by end of weekend 4.',
        highlights: ['Lower upfront cost'],
      },
    ],
    heroPriceLabel: '₦175,000 · or 2 installments of ₦87,500',
    landingImageUrl: 'https://store.public.blob.vercel-storage.com/images/school-of-finance-0123456789abcdef.jpg',
    ...over,
  }
}

export function content(over: Partial<Content> = {}): Content {
  return {
    version: 1,
    updatedAt: '2026-10-14T10:00:00.000Z',
    updatedBy: 'seed',
    programs: { 'school-of-finance': program() },
    ...over,
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/programs-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ContentSchema } from '@/lib/content-schema'
import { PROGRAMS, getProgram, isProgramSlug, liveUrl } from '@/lib/programs'
import { cohort, content, program } from './fixtures'

describe('program registry', () => {
  it('covers exactly the six learner programs, keyed by folder slug', () => {
    expect(PROGRAMS.map((p) => p.slug)).toEqual([
      'school-of-finance',
      'data-school',
      'school-of-mgmt-consulting',
      'advanced-financial-modeling',
      'school-of-hr-and-analytics',
      'project-finance-modeling',
    ])
  })

  it('excludes Corporate Training', () => {
    expect(isProgramSlug('corporate-training')).toBe(false)
  })

  it('links consulting to its real page, not its folder slug', () => {
    expect(liveUrl(getProgram('school-of-mgmt-consulting')!)).toBe(
      'https://www.edubridgeacademy.com/school-of-management-consulting',
    )
  })

  it('maps each program to its homepage card', () => {
    expect(PROGRAMS.map((p) => p.homeCardId)).toEqual(['prog-1', 'prog-2', 'prog-3', 'prog-4', 'prog-hr', 'prog-pfm'])
  })
})

describe('ContentSchema', () => {
  it('accepts a well-formed document unchanged', () => {
    expect(ContentSchema.parse(content())).toEqual(content())
  })

  it('drops keys the portal does not own', () => {
    const raw = { ...program(), extra: 'x', cohorts: [{ ...cohort(), colour: 'red' }] }
    const parsed = ContentSchema.parse({ ...content(), programs: { 'school-of-finance': raw } })
    expect(parsed.programs['school-of-finance']).toEqual(program())
  })

  it('rejects a seat count sent as text', () => {
    const bad = { ...program(), cohorts: [{ ...cohort(), seatsRemaining: '5' }] }
    expect(ContentSchema.safeParse({ ...content(), programs: { 'school-of-finance': bad } }).success).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/programs-schema.test.ts`
Expected: FAIL, "Failed to resolve import '@/lib/content-schema'".

- [ ] **Step 4: Implement the registry**

`src/lib/programs.ts`:
```ts
/**
 * The six learner programs the portal manages. Keys are the public repo's
 * folder slugs (product/sections/<slug>/) — the same keys public/cohorts.json
 * and the win-back Google Sheet use. `href` is the real page path, which
 * differs for consulting. Corporate Training is deliberately absent.
 */
export const PROGRAM_SLUGS = [
  'school-of-finance',
  'data-school',
  'school-of-mgmt-consulting',
  'advanced-financial-modeling',
  'school-of-hr-and-analytics',
  'project-finance-modeling',
] as const

export type ProgramSlug = (typeof PROGRAM_SLUGS)[number]

export interface ProgramInfo {
  slug: ProgramSlug
  name: string
  href: string
  homeCardId: string
}

export const PUBLIC_SITE_URL = 'https://www.edubridgeacademy.com'

export const PROGRAMS: readonly ProgramInfo[] = [
  { slug: 'school-of-finance', name: 'School of Finance', href: '/school-of-finance', homeCardId: 'prog-1' },
  { slug: 'data-school', name: 'Data School', href: '/data-school', homeCardId: 'prog-2' },
  {
    slug: 'school-of-mgmt-consulting',
    name: 'School of Management Consulting',
    href: '/school-of-management-consulting',
    homeCardId: 'prog-3',
  },
  {
    slug: 'advanced-financial-modeling',
    name: 'Advanced Financial Modeling',
    href: '/advanced-financial-modeling',
    homeCardId: 'prog-4',
  },
  {
    slug: 'school-of-hr-and-analytics',
    name: 'School of HR and Analytics',
    href: '/school-of-hr-and-analytics',
    homeCardId: 'prog-hr',
  },
  {
    slug: 'project-finance-modeling',
    name: 'Project Finance Modeling',
    href: '/project-finance-modeling',
    homeCardId: 'prog-pfm',
  },
]

export function isProgramSlug(s: string): s is ProgramSlug {
  return (PROGRAM_SLUGS as readonly string[]).includes(s)
}

export function getProgram(slug: string): ProgramInfo | undefined {
  return PROGRAMS.find((p) => p.slug === slug)
}

export function liveUrl(p: ProgramInfo): string {
  return `${PUBLIC_SITE_URL}${p.href}`
}
```

- [ ] **Step 5: Implement the schema**

`src/lib/content-schema.ts`:
```ts
import { z } from 'zod'

/**
 * Shape of content.json. The schema checks *types* only; business rules
 * (date order, seat bounds, friendly messages) live in validate.ts so that
 * staff get field-level messages instead of schema errors.
 */
export const COHORT_FORMATS = ['hybrid', 'virtual', 'in-person'] as const
export type CohortFormat = (typeof COHORT_FORMATS)[number]

export const CohortSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  format: z.enum(COHORT_FORMATS),
  seatsRemaining: z.number(),
  totalSeats: z.number(),
})

export const PricingOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  priceLabel: z.string(),
  amount: z.number(),
  description: z.string(),
  highlights: z.array(z.string()),
  recommended: z.boolean().optional(),
})

export const ProgramContentSchema = z.object({
  cohorts: z.array(CohortSchema),
  pricing: z.array(PricingOptionSchema),
  heroPriceLabel: z.string(),
  landingImageUrl: z.string(),
})

export const ContentSchema = z.object({
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  programs: z.record(z.string(), ProgramContentSchema),
})

export type Cohort = z.infer<typeof CohortSchema>
export type PricingOption = z.infer<typeof PricingOptionSchema>
export type ProgramContent = z.infer<typeof ProgramContentSchema>
export type Content = z.infer<typeof ContentSchema>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/programs-schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/programs.ts src/lib/content-schema.ts tests/fixtures.ts tests/programs-schema.test.ts
git commit -m "$(cat <<'EOF'
feat: program registry and content.json schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Dates, formatting, cohort status and next-cohort derivations

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/format.ts`, `src/lib/cohort-status.ts`, `src/lib/next-cohort.ts`
- Test: `tests/dates-format.test.ts`, `tests/cohort-status.test.ts`, `tests/next-cohort.test.ts`

**Interfaces:**
- Consumes: `Cohort` (Task 2).
- Produces:
  - `isRealDate(iso: string): boolean`, `todayIso(now?: Date): string`
  - `formatDay(iso: string): string` (`'23 Jan 2027'`), `formatNaira(n: number): string` (`'₦175,000'`, `'(blank)'` for NaN), `formatStamp(iso: string): string` (`'14 Oct 2026, 12:30'`, Lagos time)
  - `type CohortStatus = 'open' | 'full' | 'ended'`, `interface CohortLike`, `getCohortStatus(c, now?)`, `isCohortSelectable(c, now?)`
  - `nextOpenCohort(cohorts, now?): Cohort | null`, `heroNextCohortLabel(c: Cohort | null): string`, `cardNextCohort(c: Cohort | null): string | null`, `type ProgramPill = 'open' | 'full' | 'none'`, `programPill(cohorts, now?): ProgramPill`

- [ ] **Step 1: Write the failing tests**

`tests/dates-format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isRealDate, todayIso } from '@/lib/dates'
import { formatDay, formatNaira, formatStamp } from '@/lib/format'

describe('isRealDate', () => {
  it('accepts real calendar days', () => {
    expect(isRealDate('2027-01-23')).toBe(true)
    expect(isRealDate('2028-02-29')).toBe(true)
  })
  it.each(['2026-02-30', '2026-13-01', '23/01/2027', '', '2027-1-5'])('rejects %j', (value) => {
    expect(isRealDate(value)).toBe(false)
  })
})

describe('todayIso', () => {
  it('uses the UTC calendar day', () => {
    expect(todayIso(new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-14')
  })
})

describe('formatters', () => {
  it('formats a day', () => expect(formatDay('2027-01-23')).toBe('23 Jan 2027'))
  it('formats naira without decimals', () => expect(formatNaira(175000)).toBe('₦175,000'))
  it('shows a blank amount plainly', () => expect(formatNaira(Number.NaN)).toBe('(blank)'))
  it('formats a publish time in Lagos time', () => {
    expect(formatStamp('2026-10-14T11:30:00.000Z')).toBe('14 Oct 2026, 12:30')
  })
})
```

`tests/cohort-status.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { getCohortStatus, isCohortSelectable } from '@/lib/cohort-status'

const c = (seatsRemaining = 10) => ({ startDate: '2027-01-23', endDate: '2027-03-21', seatsRemaining })
const on = (day: string) => new Date(`${day}T12:00:00Z`)

describe('getCohortStatus (must match the public site exactly)', () => {
  it('is open before the start when seats remain', () => {
    expect(getCohortStatus(c(), on('2026-10-14'))).toBe('open')
    expect(isCohortSelectable(c(), on('2026-10-14'))).toBe(true)
  })
  it('is full before the start when no seats remain', () => expect(getCohortStatus(c(0), on('2026-10-14'))).toBe('full'))
  it('is full on the start day', () => expect(getCohortStatus(c(), on('2027-01-23'))).toBe('full'))
  it('is still full on the last day', () => expect(getCohortStatus(c(), on('2027-03-21'))).toBe('full'))
  it('is ended the day after', () => expect(getCohortStatus(c(), on('2027-03-22'))).toBe('ended'))
})
```

`tests/next-cohort.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cardNextCohort, heroNextCohortLabel, nextOpenCohort, programPill } from '@/lib/next-cohort'
import { NOW, cohort } from './fixtures'

describe('nextOpenCohort', () => {
  it('picks the earliest open cohort, skipping full and ended ones', () => {
    const cohorts = [
      cohort({ id: 'past', startDate: '2026-07-11', endDate: '2026-08-30' }),
      cohort({ id: 'sold-out', startDate: '2027-01-23', endDate: '2027-03-21', seatsRemaining: 0 }),
      cohort({ id: 'later', startDate: '2027-04-10', endDate: '2027-05-30' }),
      cohort({ id: 'next', startDate: '2027-02-06', endDate: '2027-03-14' }),
    ]
    expect(nextOpenCohort(cohorts, NOW)?.id).toBe('next')
  })
  it('returns null when nothing is open', () => {
    expect(nextOpenCohort([cohort({ seatsRemaining: 0 })], NOW)).toBeNull()
  })
  it('ignores cohorts with unset dates', () => {
    expect(nextOpenCohort([cohort({ id: 'draft', startDate: '', endDate: '' })], NOW)).toBeNull()
  })
})

describe('derived labels', () => {
  it('matches the hero label format the site uses today', () => {
    expect(heroNextCohortLabel(cohort())).toBe('Next cohort starts Saturday, 23 January 2027')
  })
  it('falls back when no cohort is open', () => {
    expect(heroNextCohortLabel(null)).toBe('New cohort dates coming soon')
  })
  it('gives the homepage card month', () => {
    expect(cardNextCohort(cohort())).toBe('January 2027')
    expect(cardNextCohort(null)).toBeNull()
  })
})

describe('programPill', () => {
  it('is open when any cohort is open', () => expect(programPill([cohort()], NOW)).toBe('open'))
  it('is full when only sold-out cohorts are upcoming', () => {
    expect(programPill([cohort({ seatsRemaining: 0 })], NOW)).toBe('full')
  })
  it('is none when everything has started or ended', () => {
    expect(programPill([cohort({ startDate: '2026-07-11', endDate: '2026-08-30' })], NOW)).toBe('none')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dates-format.test.ts tests/cohort-status.test.ts tests/next-cohort.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `dates.ts` and `format.ts`**

`src/lib/dates.ts`:
```ts
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** True only for a real calendar day written yyyy-mm-dd (rejects 2026-02-30). */
export function isRealDate(iso: string): boolean {
  if (!ISO_DAY.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Today's calendar day in UTC, matching cohort-status.ts. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
```

`src/lib/format.ts`:
```ts
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const stampDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})
const stampTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Lagos',
})

/** '2027-01-23' → '23 Jan 2027'. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d)))
}

/** 175000 → '₦175,000'. Blank (NaN) amounts read '(blank)'. */
export function formatNaira(n: number): string {
  return Number.isFinite(n) ? `₦${n.toLocaleString('en-US')}` : '(blank)'
}

/** ISO timestamp → '14 Oct 2026, 12:30' in Lagos time. */
export function formatStamp(iso: string): string {
  const date = new Date(iso)
  return `${stampDate.format(date)}, ${stampTime.format(date)}`
}
```

- [ ] **Step 4: Port `cohort-status.ts` verbatim from the public site**

Copy `C:\Users\okoro\Documents\EA Website Revamp\ea-website-revamp\src\lib\cohort-status.ts` unchanged to `src/lib/cohort-status.ts`, then add one line under the existing doc comment's first line:

```ts
 * PORTED VERBATIM from ea-website-revamp/src/lib/cohort-status.ts — keep the two in sync.
```

The file must export `CohortStatus`, `CohortLike`, `getCohortStatus`, `isCohortSelectable` exactly as in the public repo.

- [ ] **Step 5: Implement `next-cohort.ts`**

`src/lib/next-cohort.ts`:
```ts
import { getCohortStatus } from './cohort-status'
import type { Cohort } from './content-schema'
import { isRealDate, todayIso } from './dates'

const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })
const longDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

const hasRealDates = (c: Cohort) => isRealDate(c.startDate) && isRealDate(c.endDate)

/** Earliest cohort a visitor can enrol in today, or null. Half-typed cohorts never count. */
export function nextOpenCohort(cohorts: readonly Cohort[], now: Date = new Date()): Cohort | null {
  return (
    cohorts
      .filter((c) => hasRealDates(c) && getCohortStatus(c, now) === 'open')
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  )
}

/** Program hero line, e.g. 'Next cohort starts Saturday, 23 January 2027'. */
export function heroNextCohortLabel(cohort: Cohort | null): string {
  if (!cohort) return 'New cohort dates coming soon'
  const date = utcDate(cohort.startDate)
  return `Next cohort starts ${weekday.format(date)}, ${longDay.format(date)}`
}

/** Homepage card value, e.g. 'January 2027'; null renders nothing (as for Corporate today). */
export function cardNextCohort(cohort: Cohort | null): string | null {
  return cohort ? monthYear.format(utcDate(cohort.startDate)) : null
}

export type ProgramPill = 'open' | 'full' | 'none'

/** Dashboard pill: open if enrolable, full if only sold-out cohorts lie ahead, else none. */
export function programPill(cohorts: readonly Cohort[], now: Date = new Date()): ProgramPill {
  if (nextOpenCohort(cohorts, now)) return 'open'
  const today = todayIso(now)
  return cohorts.some((c) => hasRealDates(c) && c.startDate > today) ? 'full' : 'none'
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/dates-format.test.ts tests/cohort-status.test.ts tests/next-cohort.test.ts`
Expected: PASS. If `formatDay` or `formatStamp` differ only by ICU punctuation on this Node build, adjust the formatter construction (not the expected strings). The strings are what staff see.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dates.ts src/lib/format.ts src/lib/cohort-status.ts src/lib/next-cohort.ts tests/dates-format.test.ts tests/cohort-status.test.ts tests/next-cohort.test.ts
git commit -m "$(cat <<'EOF'
feat: date/format helpers, ported cohort status, next-cohort labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Validation rules and new-cohort ids

**Files:**
- Create: `src/lib/validate.ts`, `src/lib/cohort-ids.ts`
- Test: `tests/validate.test.ts`, `tests/cohort-ids.test.ts`

**Interfaces:**
- Consumes: `ProgramContent`, `Cohort` (Task 2); `isRealDate`, `todayIso` (Task 3).
- Produces:
  - `type IssueLevel = 'error' | 'warning'`, `interface Issue { path: string; level: IssueLevel; message: string }`
  - `interface ValidateOptions { now?: Date; original?: ProgramContent }`
  - `validateProgram(p: ProgramContent, opts?: ValidateOptions): Issue[]`, `hasErrors(issues: Issue[]): boolean`, `issueLabel(issue: Issue, draft: ProgramContent): string`, `isSafeImageUrl(url: string): boolean`, `MAX_LENGTHS`
  - Issue paths: `cohorts.<i>.<field>`, `pricing.<i>.<field>`, `pricing`, `heroPriceLabel`, `landingImageUrl`
  - `NEW_COHORT_PREFIX = 'new-'`, `suggestCohortName(startDate): string`, `cohortIdFor(startDate, taken: ReadonlySet<string>): string`, `finalizeCohortIds(cohorts: Cohort[]): Cohort[]`

- [ ] **Step 1: Write the failing tests**

`tests/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { hasErrors, isSafeImageUrl, issueLabel, validateProgram, type Issue } from '@/lib/validate'
import { NOW, cohort, program } from './fixtures'

const codes = (issues: Issue[]) => issues.map((i) => `${i.level}:${i.path}`)
const withCohort = (over: Parameters<typeof cohort>[0]) => program({ cohorts: [cohort(over)] })

describe('validateProgram', () => {
  it('passes a clean program', () => {
    expect(validateProgram(program(), { now: NOW })).toEqual([])
  })

  it('rejects an end date before the start date', () => {
    expect(codes(validateProgram(withCohort({ endDate: '2027-01-01' }), { now: NOW }))).toContain('error:cohorts.0.endDate')
  })

  it('rejects an end date equal to the start date', () => {
    expect(codes(validateProgram(withCohort({ endDate: '2027-01-23' }), { now: NOW }))).toContain('error:cohorts.0.endDate')
  })

  it('rejects impossible dates', () => {
    const issues = validateProgram(withCohort({ startDate: '2026-02-30' }), { now: NOW })
    expect(codes(issues)).toContain('error:cohorts.0.startDate')
  })

  it('rejects blank seat numbers', () => {
    const issues = validateProgram(withCohort({ seatsRemaining: Number.NaN }), { now: NOW })
    expect(codes(issues)).toContain('error:cohorts.0.seatsRemaining')
  })

  it('rejects seats left above total seats', () => {
    const issues = validateProgram(withCohort({ seatsRemaining: 60, totalSeats: 50 }), { now: NOW })
    expect(issues).toContainEqual({ path: 'cohorts.0.seatsRemaining', level: 'error', message: "Seats left can't be more than total seats" })
  })

  it('rejects fractional, negative and zero seat totals', () => {
    expect(codes(validateProgram(withCohort({ seatsRemaining: 2.5 }), { now: NOW }))).toContain('error:cohorts.0.seatsRemaining')
    expect(codes(validateProgram(withCohort({ seatsRemaining: -1 }), { now: NOW }))).toContain('error:cohorts.0.seatsRemaining')
    expect(codes(validateProgram(withCohort({ totalSeats: 0, seatsRemaining: 0 }), { now: NOW }))).toContain('error:cohorts.0.totalSeats')
  })

  it('requires a cohort name', () => {
    expect(codes(validateProgram(withCohort({ name: '  ' }), { now: NOW }))).toContain('error:cohorts.0.name')
  })

  it('rejects duplicate cohort ids', () => {
    const p = program({ cohorts: [cohort(), cohort({ startDate: '2027-04-10', endDate: '2027-05-30' })] })
    expect(codes(validateProgram(p, { now: NOW }))).toContain('error:cohorts.1.id')
  })

  it('rejects a zero or fractional amount', () => {
    const p = program()
    p.pricing[0] = { ...p.pricing[0]!, amount: 0 }
    p.pricing[1] = { ...p.pricing[1]!, amount: 87500.5 }
    expect(codes(validateProgram(p, { now: NOW }))).toEqual(['error:pricing.0.amount', 'error:pricing.1.amount'])
  })

  it('rejects blank labels', () => {
    const p = program({ heroPriceLabel: ' ' })
    p.pricing[0] = { ...p.pricing[0]!, priceLabel: '', title: '' }
    expect(codes(validateProgram(p, { now: NOW }))).toEqual([
      'error:pricing.0.title',
      'error:pricing.0.priceLabel',
      'error:heroPriceLabel',
    ])
  })

  it('rejects adding or removing pricing options', () => {
    const p = program({ pricing: [program().pricing[0]!] })
    expect(codes(validateProgram(p, { now: NOW, original: program() }))).toContain('error:pricing')
  })

  it('requires a landing image', () => {
    expect(codes(validateProgram(program({ landingImageUrl: '' }), { now: NOW }))).toContain('error:landingImageUrl')
  })

  it.each([
    'javascript:alert(1)',
    'http://store.public.blob.vercel-storage.com/images/a.webp',
    'https://evil.example.com/a.webp',
    'https://store.public.blob.vercel-storage.com.evil.com/a.webp',
    'data:text/html;base64,PHNjcmlwdD4=',
  ])('rejects image URLs that are not our own image store: %s', (url) => {
    expect(codes(validateProgram(program({ landingImageUrl: url }), { now: NOW }))).toContain('error:landingImageUrl')
  })

  it('accepts Blob image URLs and demo-mode data images', () => {
    expect(isSafeImageUrl('https://abc123.public.blob.vercel-storage.com/images/data-school-0123456789abcdef.webp')).toBe(true)
    expect(isSafeImageUrl('data:image/webp;base64,UklGRg==')).toBe(true)
  })

  it('caps text lengths so nothing oversized reaches the public site', () => {
    const p = program({ heroPriceLabel: 'x'.repeat(121), cohorts: [cohort({ name: 'n'.repeat(81) })] })
    p.pricing[0] = { ...p.pricing[0]!, description: 'd'.repeat(501) }
    expect(codes(validateProgram(p, { now: NOW }))).toEqual([
      'error:cohorts.0.name',
      'error:pricing.0.description',
      'error:heroPriceLabel',
    ])
  })

  it('warns about, but allows, a newly entered past start date', () => {
    const p = withCohort({ id: 'new-1', startDate: '2026-09-01', endDate: '2026-12-01' })
    const issues = validateProgram(p, { now: NOW, original: program() })
    expect(codes(issues)).toEqual(['warning:cohorts.0.startDate'])
    expect(hasErrors(issues)).toBe(false)
  })

  it('does not warn about historical cohorts nobody touched', () => {
    const past = withCohort({ id: 'cohort-2026-q1', startDate: '2026-01-10', endDate: '2026-02-28', seatsRemaining: 0 })
    expect(validateProgram(past, { now: NOW, original: past })).toEqual([])
  })
})

describe('issueLabel', () => {
  it('prefixes cohort and pricing issues with what they belong to', () => {
    const p = program()
    expect(issueLabel({ path: 'cohorts.0.endDate', level: 'error', message: 'End date must be after the start date' }, p)).toBe(
      'Q1 2027 Cohort: End date must be after the start date',
    )
    expect(issueLabel({ path: 'pricing.1.amount', level: 'error', message: 'x' }, p)).toBe('2 installments: x')
    expect(issueLabel({ path: 'heroPriceLabel', level: 'error', message: 'y' }, p)).toBe('y')
  })
  it('falls back to a position when the name is blank', () => {
    const p = withCohort({ name: '' })
    expect(issueLabel({ path: 'cohorts.0.name', level: 'error', message: 'Give this cohort a name' }, p)).toBe(
      'Cohort 1: Give this cohort a name',
    )
  })
})
```

`tests/cohort-ids.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cohortIdFor, finalizeCohortIds, suggestCohortName } from '@/lib/cohort-ids'
import { cohort } from './fixtures'

describe('new cohort naming', () => {
  it('suggests a quarter name from the start date', () => {
    expect(suggestCohortName('2027-04-10')).toBe('Q2 2027 Cohort')
    expect(suggestCohortName('2027-12-01')).toBe('Q4 2027 Cohort')
    expect(suggestCohortName('')).toBe('')
  })

  it('builds ids in the existing cohort-YYYY-qN style, avoiding clashes', () => {
    expect(cohortIdFor('2027-04-10', new Set())).toBe('cohort-2027-q2')
    expect(cohortIdFor('2027-04-10', new Set(['cohort-2027-q2']))).toBe('cohort-2027-q2-2')
  })

  it('keeps existing ids and gives each new cohort a unique permanent id', () => {
    const result = finalizeCohortIds([
      cohort({ id: 'cohort-2027-q1' }),
      cohort({ id: 'new-a', startDate: '2027-02-06' }),
      cohort({ id: 'new-b', startDate: '2027-03-01' }),
    ])
    expect(result.map((c) => c.id)).toEqual(['cohort-2027-q1', 'cohort-2027-q1-2', 'cohort-2027-q1-3'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/validate.test.ts tests/cohort-ids.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `cohort-ids.ts`**

`src/lib/cohort-ids.ts`:
```ts
import type { Cohort } from './content-schema'
import { isRealDate } from './dates'

/** Cohorts added in the editor carry a temporary id with this prefix until publish. */
export const NEW_COHORT_PREFIX = 'new-'

function yearQuarter(iso: string): { year: number; quarter: number } | null {
  if (!isRealDate(iso)) return null
  const [year, month] = iso.split('-').map(Number) as [number, number]
  return { year, quarter: Math.floor((month - 1) / 3) + 1 }
}

export function suggestCohortName(startDate: string): string {
  const yq = yearQuarter(startDate)
  return yq ? `Q${yq.quarter} ${yq.year} Cohort` : ''
}

export function cohortIdFor(startDate: string, taken: ReadonlySet<string>): string {
  const yq = yearQuarter(startDate)
  const base = yq ? `cohort-${yq.year}-q${yq.quarter}` : 'cohort'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** Replace temporary ids with permanent ones. Existing ids never change (win-back keys on them). */
export function finalizeCohortIds(cohorts: Cohort[]): Cohort[] {
  const taken = new Set(cohorts.filter((c) => !c.id.startsWith(NEW_COHORT_PREFIX)).map((c) => c.id))
  return cohorts.map((c) => {
    if (!c.id.startsWith(NEW_COHORT_PREFIX)) return c
    const id = cohortIdFor(c.startDate, taken)
    taken.add(id)
    return { ...c, id }
  })
}
```

- [ ] **Step 4: Implement `validate.ts`**

`src/lib/validate.ts`:
```ts
import type { ProgramContent } from './content-schema'
import { isRealDate, todayIso } from './dates'

export type IssueLevel = 'error' | 'warning'
export interface Issue {
  path: string
  level: IssueLevel
  message: string
}
export interface ValidateOptions {
  now?: Date
  /** The live version of this program; enables the pricing-set and past-date checks. */
  original?: ProgramContent
}

/** Upper bounds keep stored text to what the public layout can show (and limit abuse). */
export const MAX_LENGTHS = { cohortName: 80, title: 80, priceLabel: 120, description: 500, heroPriceLabel: 120 } as const

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i
const DATA_IMAGE = /^data:image\/(webp|jpeg|png);base64,[a-z0-9+/=]+$/i

/**
 * Only images from our own Blob store (or demo-mode data images) may be published.
 * Blocks javascript:, plain http, look-alike hosts and non-image data URLs (XSS defence).
 */
export function isSafeImageUrl(url: string): boolean {
  if (DATA_IMAGE.test(url)) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && BLOB_HOST.test(parsed.hostname)
  } catch {
    return false
  }
}

export function validateProgram(p: ProgramContent, opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = []
  const error = (path: string, message: string) => issues.push({ path, level: 'error', message })
  const warn = (path: string, message: string) => issues.push({ path, level: 'warning', message })
  const tooLong = (path: string, value: string, max: number) => {
    if (value.length > max) error(path, `Keep this under ${max} characters`)
  }
  const today = todayIso(opts.now)
  const originalStarts = new Map(opts.original?.cohorts.map((c) => [c.id, c.startDate]) ?? [])
  const seenIds = new Set<string>()

  p.cohorts.forEach((c, i) => {
    const at = (field: string) => `cohorts.${i}.${field}`
    if (seenIds.has(c.id)) error(at('id'), 'This cohort is listed twice. Remove one copy')
    seenIds.add(c.id)
    if (!c.name.trim()) error(at('name'), 'Give this cohort a name')
    tooLong(at('name'), c.name, MAX_LENGTHS.cohortName)

    const startOk = isRealDate(c.startDate)
    const endOk = isRealDate(c.endDate)
    if (!startOk) error(at('startDate'), 'Pick a valid start date')
    if (!endOk) error(at('endDate'), 'Pick a valid end date')
    if (startOk && endOk && c.startDate >= c.endDate) error(at('endDate'), 'End date must be after the start date')
    if (startOk && c.startDate < today && originalStarts.get(c.id) !== c.startDate) {
      warn(at('startDate'), 'This start date is in the past, so the cohort will show as Full or Ended')
    }

    const totalOk = Number.isInteger(c.totalSeats) && c.totalSeats >= 1
    if (!totalOk) error(at('totalSeats'), 'Total seats must be a whole number of at least 1')
    if (!Number.isInteger(c.seatsRemaining) || c.seatsRemaining < 0) {
      error(at('seatsRemaining'), 'Seats left must be a whole number, 0 or more')
    } else if (totalOk && c.seatsRemaining > c.totalSeats) {
      error(at('seatsRemaining'), "Seats left can't be more than total seats")
    }
  })

  p.pricing.forEach((option, i) => {
    const at = (field: string) => `pricing.${i}.${field}`
    if (!option.title.trim()) error(at('title'), 'Give this option a title')
    tooLong(at('title'), option.title, MAX_LENGTHS.title)
    if (!option.priceLabel.trim()) error(at('priceLabel'), 'Add the price exactly as it should appear')
    tooLong(at('priceLabel'), option.priceLabel, MAX_LENGTHS.priceLabel)
    if (!Number.isInteger(option.amount) || option.amount <= 0) error(at('amount'), 'Amount must be a whole number above 0')
    tooLong(at('description'), option.description, MAX_LENGTHS.description)
  })

  if (opts.original) {
    const ids = (q: ProgramContent) => q.pricing.map((o) => o.id).sort().join(',')
    if (ids(p) !== ids(opts.original)) error('pricing', "Pricing options can't be added or removed here")
  }

  if (!p.heroPriceLabel.trim()) error('heroPriceLabel', 'Add the price line shown under the program title')
  tooLong('heroPriceLabel', p.heroPriceLabel, MAX_LENGTHS.heroPriceLabel)
  if (!p.landingImageUrl.trim()) error('landingImageUrl', 'Upload a landing image')
  else if (!isSafeImageUrl(p.landingImageUrl)) error('landingImageUrl', 'Upload the image here instead of pasting a link')

  return issues
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

/** 'Q1 2027 Cohort: End date must be after the start date' — for the review panel summary. */
export function issueLabel(issue: Issue, draft: ProgramContent): string {
  const match = /^(cohorts|pricing)\.(\d+)\./.exec(issue.path)
  if (!match) return issue.message
  const i = Number(match[2])
  const owner =
    match[1] === 'cohorts' ? draft.cohorts[i]?.name.trim() || `Cohort ${i + 1}` : draft.pricing[i]?.title.trim() || `Option ${i + 1}`
  return `${owner}: ${issue.message}`
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/validate.test.ts tests/cohort-ids.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validate.ts src/lib/cohort-ids.ts tests/validate.test.ts tests/cohort-ids.test.ts
git commit -m "$(cat <<'EOF'
feat: validation rules and permanent ids for new cohorts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Plain-language change list

**Files:**
- Create: `src/lib/diff.ts`
- Test: `tests/diff.test.ts`

**Interfaces:**
- Consumes: `ProgramContent` (Task 2); `formatDay`, `formatNaira`, `isRealDate`, `nextOpenCohort` (Task 3).
- Produces: `describeChanges(before: ProgramContent, after: ProgramContent, now?: Date): string[]`. Line order: cohort edits/additions (in draft order), removals, pricing, hero label, image, then the derived "Next open cohort" line.

- [ ] **Step 1: Write the failing tests**

`tests/diff.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { describeChanges } from '@/lib/diff'
import { NOW, cohort, program } from './fixtures'

describe('describeChanges', () => {
  it('returns nothing when nothing changed', () => {
    expect(describeChanges(program(), program(), NOW)).toEqual([])
  })

  it('describes cohort edits in one line and the knock-on next-cohort change', () => {
    const after = program({ cohorts: [cohort({ startDate: '2027-01-30', seatsRemaining: 0 })] })
    expect(describeChanges(program(), after, NOW)).toEqual([
      'Q1 2027 Cohort: start 23 Jan 2027 → 30 Jan 2027; seats left 20 → 0',
      'Next open cohort on the site: 23 Jan 2027 → none',
    ])
  })

  it('describes added and removed cohorts', () => {
    const before = program({ cohorts: [cohort(), cohort({ id: 'old', name: 'Q3 2026 Cohort', startDate: '2026-07-11', endDate: '2026-08-30' })] })
    const after = program({
      cohorts: [cohort(), cohort({ id: 'new-1', name: 'Q2 2027 Cohort', startDate: '2027-04-10', endDate: '2027-05-30', totalSeats: 25, seatsRemaining: 25 })],
    })
    expect(describeChanges(before, after, NOW)).toEqual([
      'Added Q2 2027 Cohort (10 Apr 2027 – 30 May 2027, 25 seats)',
      'Removed Q3 2026 Cohort',
    ])
  })

  it('describes price changes with naira formatting', () => {
    const after = program()
    after.pricing[0] = { ...after.pricing[0]!, priceLabel: '₦200,000', amount: 200000 }
    expect(describeChanges(program(), after, NOW)).toEqual([
      'Pay in full: price label "₦175,000" → "₦200,000"; amount ₦175,000 → ₦200,000',
    ])
  })

  it('describes hero label and image changes', () => {
    const after = program({ heroPriceLabel: '₦200,000 · or 2 installments of ₦100,000', landingImageUrl: 'https://x/new.webp' })
    expect(describeChanges(program(), after, NOW)).toEqual([
      'Hero price label: "₦175,000 · or 2 installments of ₦87,500" → "₦200,000 · or 2 installments of ₦100,000"',
      'Landing image replaced',
    ])
  })

  it('shows blank values plainly while a draft is half-typed', () => {
    const after = program({ cohorts: [cohort({ seatsRemaining: Number.NaN })] })
    expect(describeChanges(program(), after, NOW)[0]).toBe('Q1 2027 Cohort: seats left 20 → (blank)')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/diff.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement `diff.ts`**

`src/lib/diff.ts`:
```ts
import type { ProgramContent } from './content-schema'
import { isRealDate } from './dates'
import { formatDay, formatNaira } from './format'
import { nextOpenCohort } from './next-cohort'

const day = (iso: string) => (isRealDate(iso) ? formatDay(iso) : iso || '(blank)')
const count = (n: number) => (Number.isFinite(n) ? String(n) : '(blank)')

/** Human-readable list of what publishing `after` would change compared with `before`. */
export function describeChanges(before: ProgramContent, after: ProgramContent, now: Date = new Date()): string[] {
  const lines: string[] = []

  const beforeCohorts = new Map(before.cohorts.map((c) => [c.id, c]))
  const afterIds = new Set(after.cohorts.map((c) => c.id))
  for (const a of after.cohorts) {
    const b = beforeCohorts.get(a.id)
    if (!b) {
      lines.push(`Added ${a.name || 'a new cohort'} (${day(a.startDate)} – ${day(a.endDate)}, ${count(a.totalSeats)} seats)`)
      continue
    }
    const parts: string[] = []
    if (b.name !== a.name) parts.push(`renamed to "${a.name}"`)
    if (b.startDate !== a.startDate) parts.push(`start ${day(b.startDate)} → ${day(a.startDate)}`)
    if (b.endDate !== a.endDate) parts.push(`end ${day(b.endDate)} → ${day(a.endDate)}`)
    if (b.format !== a.format) parts.push(`format ${b.format} → ${a.format}`)
    if (!Object.is(b.seatsRemaining, a.seatsRemaining)) parts.push(`seats left ${count(b.seatsRemaining)} → ${count(a.seatsRemaining)}`)
    if (!Object.is(b.totalSeats, a.totalSeats)) parts.push(`total seats ${count(b.totalSeats)} → ${count(a.totalSeats)}`)
    if (parts.length) lines.push(`${b.name}: ${parts.join('; ')}`)
  }
  for (const b of before.cohorts) if (!afterIds.has(b.id)) lines.push(`Removed ${b.name}`)

  const beforePricing = new Map(before.pricing.map((p) => [p.id, p]))
  for (const a of after.pricing) {
    const b = beforePricing.get(a.id)
    if (!b) continue
    const parts: string[] = []
    if (b.title !== a.title) parts.push(`title "${b.title}" → "${a.title}"`)
    if (b.priceLabel !== a.priceLabel) parts.push(`price label "${b.priceLabel}" → "${a.priceLabel}"`)
    if (!Object.is(b.amount, a.amount)) parts.push(`amount ${formatNaira(b.amount)} → ${formatNaira(a.amount)}`)
    if (b.description !== a.description) parts.push('description updated')
    if (parts.length) lines.push(`${b.title}: ${parts.join('; ')}`)
  }

  if (before.heroPriceLabel !== after.heroPriceLabel) {
    lines.push(`Hero price label: "${before.heroPriceLabel}" → "${after.heroPriceLabel}"`)
  }
  if (before.landingImageUrl !== after.landingImageUrl) lines.push('Landing image replaced')

  if (lines.length > 0) {
    const was = nextOpenCohort(before.cohorts, now)
    const will = nextOpenCohort(after.cohorts, now)
    if ((was?.startDate ?? null) !== (will?.startDate ?? null)) {
      lines.push(`Next open cohort on the site: ${was ? formatDay(was.startDate) : 'none'} → ${will ? formatDay(will.startDate) : 'none'}`)
    }
  }
  return lines
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff.ts tests/diff.test.ts
git commit -m "$(cat <<'EOF'
feat: plain-language change list for review and publish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Win-back cohort feed builder

**Files:**
- Create: `src/lib/cohorts-feed.ts`
- Test: `tests/cohorts-feed.test.ts`

**Interfaces:**
- Consumes: `Content` (Task 2); `PROGRAMS`, `liveUrl` (Task 2).
- Produces: `interface FeedCohort { id; name; startDate; endDate }`, `interface CohortsFeed { programs: Record<string, { url: string; cohorts: FeedCohort[] }> }`, `buildCohortsFeed(content: Content): CohortsFeed`. Same shape as today's `public/cohorts.json` (read by `apps-script/Code.gs` `feed.programs[program_id].cohorts` / `.url`).

- [ ] **Step 1: Write the failing tests**

`tests/cohorts-feed.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildCohortsFeed } from '@/lib/cohorts-feed'
import { cohort, content, program } from './fixtures'

describe('buildCohortsFeed', () => {
  it('lists cohorts by start date with only the fields win-back reads', () => {
    const c = content({
      programs: {
        'school-of-finance': program({
          cohorts: [
            cohort({ id: 'b', name: 'B', startDate: '2027-04-10', endDate: '2027-05-30' }),
            cohort({ id: 'a', name: 'A', startDate: '2027-01-23', endDate: '2027-03-21' }),
          ],
        }),
      },
    })
    expect(buildCohortsFeed(c)).toEqual({
      programs: {
        'school-of-finance': {
          url: 'https://www.edubridgeacademy.com/school-of-finance',
          cohorts: [
            { id: 'a', name: 'A', startDate: '2027-01-23', endDate: '2027-03-21' },
            { id: 'b', name: 'B', startDate: '2027-04-10', endDate: '2027-05-30' },
          ],
        },
      },
    })
  })

  it('uses the real consulting page URL', () => {
    const feed = buildCohortsFeed(content({ programs: { 'school-of-mgmt-consulting': program() } }))
    expect(feed.programs['school-of-mgmt-consulting']?.url).toBe('https://www.edubridgeacademy.com/school-of-management-consulting')
  })

  it('leaves out programs with no cohorts', () => {
    const feed = buildCohortsFeed(content({ programs: { 'data-school': program({ cohorts: [] }), 'school-of-finance': program() } }))
    expect(Object.keys(feed.programs)).toEqual(['school-of-finance'])
  })

  it('orders program keys alphabetically like the old feed', () => {
    const feed = buildCohortsFeed(
      content({ programs: { 'school-of-finance': program(), 'data-school': program(), 'advanced-financial-modeling': program() } }),
    )
    expect(Object.keys(feed.programs)).toEqual(['advanced-financial-modeling', 'data-school', 'school-of-finance'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cohorts-feed.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement `cohorts-feed.ts`**

`src/lib/cohorts-feed.ts`:
```ts
import type { Content } from './content-schema'
import { PROGRAMS, liveUrl } from './programs'

/**
 * cohorts-feed.json — same shape as the public repo's public/cohorts.json,
 * which apps-script/Code.gs reads as feed.programs[program_id].{url,cohorts}.
 */
export interface FeedCohort {
  id: string
  name: string
  startDate: string
  endDate: string
}
export interface CohortsFeed {
  programs: Record<string, { url: string; cohorts: FeedCohort[] }>
}

export function buildCohortsFeed(content: Content): CohortsFeed {
  const programs: CohortsFeed['programs'] = {}
  const ordered = [...PROGRAMS].sort((a, b) => a.slug.localeCompare(b.slug))
  for (const info of ordered) {
    const entry = content.programs[info.slug]
    if (!entry || entry.cohorts.length === 0) continue
    programs[info.slug] = {
      url: liveUrl(info),
      cohorts: entry.cohorts
        .map(({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }
  }
  return { programs }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cohorts-feed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cohorts-feed.ts tests/cohorts-feed.test.ts
git commit -m "$(cat <<'EOF'
feat: derive the win-back cohorts feed from content

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Content store interface, memory store and Vercel Blob store

**Files:**
- Create: `src/lib/store.ts`, `src/lib/memory-store.ts`, `src/lib/blob-store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `Content`, `ContentSchema` (Task 2); `CohortsFeed` (Task 6).
- Produces:
  - Constants `CONTENT_PATH = 'content.json'`, `FEED_PATH = 'cohorts-feed.json'`, `BACKUP_PREFIX = 'backups/'`, `IMAGE_PREFIX = 'images/'`, `CONTENT_MAX_AGE_SECONDS = 60`
  - `class ConflictError extends Error`, `class NotSeededError extends Error`
  - `interface BackupInfo { pathname: string; version: number; savedAt: string }`, `interface RecentPublish { version: number; at: string }`
  - `interface ContentStore { readContent(): Promise<{ content: Content; etag: string }>; createContent(c: Content): Promise<void>; writeContent(c: Content, ifMatch: string): Promise<void>; writeBackup(c: Content, savedAt: Date): Promise<BackupInfo>; listBackups(): Promise<BackupInfo[]>; readBackup(pathname: string): Promise<Content>; writeFeed(feed: CohortsFeed): Promise<void>; putImage(pathname: string, body: Buffer, contentType: string): Promise<string> }`
  - `backupPathname(version, savedAt): string`, `backupInfoFromPathname(pathname): BackupInfo | null`, `sortBackups(list): BackupInfo[]` (newest first), `recentPublishes(backups, n = 3): RecentPublish[]`
  - `createMemoryStore(initial?: Content): MemoryStore` where `MemoryStore = ContentStore & { files: Map<string, unknown> }`; its `putImage` returns a `data:` URL
  - `createBlobStore(token?: string): ContentStore`

- [ ] **Step 1: Write the failing tests (memory store + shared helpers)**

`tests/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@/lib/memory-store'
import { ConflictError, NotSeededError, backupInfoFromPathname, backupPathname, recentPublishes } from '@/lib/store'
import { content } from './fixtures'

describe('backup pathnames', () => {
  it('round-trips version and time', () => {
    const pathname = backupPathname(12, new Date('2026-10-14T12:30:05.123Z'))
    expect(pathname).toBe('backups/content-v000012-2026-10-14T12-30-05-123Z.json')
    expect(backupInfoFromPathname(pathname)).toEqual({ pathname, version: 12, savedAt: '2026-10-14T12:30:05.123Z' })
  })
  it('ignores unrelated files', () => {
    expect(backupInfoFromPathname('backups/notes.txt')).toBeNull()
  })
})

describe('recentPublishes', () => {
  it('turns backups into the versions that replaced them, newest first', () => {
    const backups = [
      { pathname: 'c', version: 3, savedAt: '2026-10-14T12:00:00.000Z' },
      { pathname: 'b', version: 2, savedAt: '2026-10-13T12:00:00.000Z' },
      { pathname: 'a', version: 1, savedAt: '2026-10-12T12:00:00.000Z' },
    ]
    expect(recentPublishes(backups, 2)).toEqual([
      { version: 4, at: '2026-10-14T12:00:00.000Z' },
      { version: 3, at: '2026-10-13T12:00:00.000Z' },
    ])
  })
})

describe('memory store', () => {
  it('reports an unseeded store', async () => {
    await expect(createMemoryStore().readContent()).rejects.toBeInstanceOf(NotSeededError)
  })

  it('creates content only once', async () => {
    const store = createMemoryStore()
    await store.createContent(content())
    await expect(store.createContent(content())).rejects.toThrow(/already exists/)
  })

  it('rejects writes made with a stale etag', async () => {
    const store = createMemoryStore(content())
    const { etag } = await store.readContent()
    await store.writeContent(content({ version: 2 }), etag)
    await expect(store.writeContent(content({ version: 3 }), etag)).rejects.toBeInstanceOf(ConflictError)
  })

  it('hands out copies, not live references', async () => {
    const store = createMemoryStore(content())
    const first = await store.readContent()
    first.content.version = 99
    expect((await store.readContent()).content.version).toBe(1)
  })

  it('lists backups newest first and reads them back', async () => {
    const store = createMemoryStore(content())
    await store.writeBackup(content({ version: 1 }), new Date('2026-10-14T10:00:00Z'))
    await store.writeBackup(content({ version: 2 }), new Date('2026-10-14T11:00:00Z'))
    const backups = await store.listBackups()
    expect(backups.map((b) => b.version)).toEqual([2, 1])
    expect((await store.readBackup(backups[1]!.pathname)).version).toBe(1)
  })

  it('returns a data URL for images', async () => {
    const url = await createMemoryStore().putImage('images/x.webp', Buffer.from('abc'), 'image/webp')
    expect(url).toBe('data:image/webp;base64,YWJj')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `store.ts`**

`src/lib/store.ts`:
```ts
import type { CohortsFeed } from './cohorts-feed'
import type { Content } from './content-schema'

export const CONTENT_PATH = 'content.json'
export const FEED_PATH = 'cohorts-feed.json'
export const BACKUP_PREFIX = 'backups/'
export const IMAGE_PREFIX = 'images/'
/** Public cache lifetime for content.json and the feed: "live within about a minute". */
export const CONTENT_MAX_AGE_SECONDS = 60

export class ConflictError extends Error {
  constructor() {
    super('content.json changed since it was read')
    this.name = 'ConflictError'
  }
}
export class NotSeededError extends Error {
  constructor() {
    super('content.json does not exist yet; run the seed script')
    this.name = 'NotSeededError'
  }
}

export interface BackupInfo {
  pathname: string
  version: number
  savedAt: string
}
export interface RecentPublish {
  version: number
  at: string
}

/** Everything the portal needs from storage. Blob in real use; memory in tests and demo mode. */
export interface ContentStore {
  readContent(): Promise<{ content: Content; etag: string }>
  createContent(content: Content): Promise<void>
  writeContent(content: Content, ifMatch: string): Promise<void>
  writeBackup(content: Content, savedAt: Date): Promise<BackupInfo>
  listBackups(): Promise<BackupInfo[]>
  readBackup(pathname: string): Promise<Content>
  writeFeed(feed: CohortsFeed): Promise<void>
  putImage(pathname: string, body: Buffer, contentType: string): Promise<string>
}

export function backupPathname(version: number, savedAt: Date): string {
  const stamp = savedAt.toISOString().replace(/[:.]/g, '-')
  return `${BACKUP_PREFIX}content-v${String(version).padStart(6, '0')}-${stamp}.json`
}

const BACKUP_RE = /^backups\/content-v(\d{6})-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/

export function backupInfoFromPathname(pathname: string): BackupInfo | null {
  const m = BACKUP_RE.exec(pathname)
  if (!m) return null
  return { pathname, version: Number(m[1]), savedAt: `${m[2]}T${m[3]}:${m[4]}:${m[5]}.${m[6]}Z` }
}

export function sortBackups(list: BackupInfo[]): BackupInfo[] {
  return [...list].sort((a, b) => b.version - a.version || b.savedAt.localeCompare(a.savedAt))
}

/** A backup of version v saved at T means version v+1 was published at T. */
export function recentPublishes(backups: BackupInfo[], n = 3): RecentPublish[] {
  return sortBackups(backups)
    .slice(0, n)
    .map((b) => ({ version: b.version + 1, at: b.savedAt }))
}
```

- [ ] **Step 4: Implement `memory-store.ts`**

`src/lib/memory-store.ts`:
```ts
import type { Content } from './content-schema'
import {
  ConflictError,
  FEED_PATH,
  NotSeededError,
  backupInfoFromPathname,
  backupPathname,
  sortBackups,
  type BackupInfo,
  type ContentStore,
} from './store'

export type MemoryStore = ContentStore & { files: Map<string, unknown> }

/** In-process store for tests and local demo mode. Mirrors Blob semantics (etags, create-once). */
export function createMemoryStore(initial?: Content): MemoryStore {
  const files = new Map<string, unknown>()
  let etagCounter = 0
  const nextEtag = () => `"m${++etagCounter}"`
  let current: { value: Content; etag: string } | null = initial ? { value: structuredClone(initial), etag: nextEtag() } : null

  return {
    files,
    async readContent() {
      if (!current) throw new NotSeededError()
      return { content: structuredClone(current.value), etag: current.etag }
    },
    async createContent(content) {
      if (current) throw new Error('content.json already exists')
      current = { value: structuredClone(content), etag: nextEtag() }
    },
    async writeContent(content, ifMatch) {
      if (!current || current.etag !== ifMatch) throw new ConflictError()
      current = { value: structuredClone(content), etag: nextEtag() }
    },
    async writeBackup(content, savedAt) {
      const pathname = backupPathname(content.version, savedAt)
      files.set(pathname, structuredClone(content))
      return { pathname, version: content.version, savedAt: savedAt.toISOString() }
    },
    async listBackups() {
      const infos = [...files.keys()].map(backupInfoFromPathname).filter((b): b is BackupInfo => b !== null)
      return sortBackups(infos)
    },
    async readBackup(pathname) {
      const value = files.get(pathname)
      if (!value) throw new Error(`No backup at ${pathname}`)
      return structuredClone(value) as Content
    },
    async writeFeed(feed) {
      files.set(FEED_PATH, structuredClone(feed))
    },
    async putImage(pathname, body, contentType) {
      files.set(pathname, Buffer.from(body))
      return `data:${contentType};base64,${Buffer.from(body).toString('base64')}`
    },
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirm the installed Blob SDK API before writing the Blob store**

Run:
```bash
node -e "const b=require('@vercel/blob'); console.log(['get','put','list','head','BlobPreconditionFailedError'].map(n=>n+':'+typeof b[n]).join(' '))"
```
Expected: `get:function put:function list:function head:function BlobPreconditionFailedError:function`. If `get` is missing, use the fallback in Step 7's comment.

- [ ] **Step 7: Implement `blob-store.ts`**

`src/lib/blob-store.ts`:
```ts
import { BlobPreconditionFailedError, get, list, put } from '@vercel/blob'
import type { CohortsFeed } from './cohorts-feed'
import { ContentSchema, type Content } from './content-schema'
import {
  BACKUP_PREFIX,
  CONTENT_MAX_AGE_SECONDS,
  CONTENT_PATH,
  ConflictError,
  FEED_PATH,
  NotSeededError,
  backupInfoFromPathname,
  backupPathname,
  sortBackups,
  type BackupInfo,
  type ContentStore,
} from './store'

const ONE_YEAR = 60 * 60 * 24 * 365
const JSON_TYPE = 'application/json'

/** Vercel Blob implementation. Public-read objects; writes need BLOB_READ_WRITE_TOKEN (server only). */
export function createBlobStore(token = process.env.BLOB_READ_WRITE_TOKEN): ContentStore {
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set')
  const base = { access: 'public' as const, token, addRandomSuffix: false }

  // Reads bypass the CDN so the editor always starts from the latest version.
  // Fallback if `get` is unavailable: head(pathname, { token }) for { url, etag },
  // then fetch(`${url}?v=${encodeURIComponent(etag)}`, { cache: 'no-store' }).
  async function readJson(pathname: string): Promise<{ json: unknown; etag: string } | null> {
    const result = await get(pathname, { access: 'public', token, useCache: false })
    if (!result) return null
    const text = await new Response(result.stream).text()
    return { json: JSON.parse(text), etag: result.blob.etag }
  }

  function putJson(pathname: string, data: unknown, options: { allowOverwrite: boolean; cacheControlMaxAge: number; ifMatch?: string }) {
    return put(pathname, JSON.stringify(data, null, 2), { ...base, contentType: JSON_TYPE, ...options })
  }

  return {
    async readContent() {
      const result = await readJson(CONTENT_PATH)
      if (!result) throw new NotSeededError()
      return { content: ContentSchema.parse(result.json), etag: result.etag }
    },
    async createContent(content: Content) {
      await putJson(CONTENT_PATH, content, { allowOverwrite: false, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
    },
    async writeContent(content: Content, ifMatch: string) {
      try {
        await putJson(CONTENT_PATH, content, { allowOverwrite: true, ifMatch, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw new ConflictError()
        throw error
      }
    },
    async writeBackup(content: Content, savedAt: Date): Promise<BackupInfo> {
      const pathname = backupPathname(content.version, savedAt)
      await putJson(pathname, content, { allowOverwrite: false, cacheControlMaxAge: ONE_YEAR })
      return { pathname, version: content.version, savedAt: savedAt.toISOString() }
    },
    async listBackups() {
      const infos: BackupInfo[] = []
      let cursor: string | undefined
      do {
        const page = await list({ prefix: BACKUP_PREFIX, token, cursor, limit: 1000 })
        for (const blob of page.blobs) {
          const info = backupInfoFromPathname(blob.pathname)
          if (info) infos.push(info)
        }
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
      return sortBackups(infos)
    },
    async readBackup(pathname: string) {
      const result = await readJson(pathname)
      if (!result) throw new Error(`No backup at ${pathname}`)
      return ContentSchema.parse(result.json)
    },
    async writeFeed(feed: CohortsFeed) {
      await putJson(FEED_PATH, feed, { allowOverwrite: true, cacheControlMaxAge: CONTENT_MAX_AGE_SECONDS })
    },
    async putImage(pathname: string, body: Buffer, contentType: string) {
      // Hashed names mean identical bytes map to the same object, so overwrite is harmless.
      const blob = await put(pathname, body, { ...base, contentType, allowOverwrite: true, cacheControlMaxAge: ONE_YEAR })
      return blob.url
    },
  }
}
```

- [ ] **Step 8: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean (if `get`'s option names differ in the installed SDK, fix them to match its `.d.ts`); all tests PASS. The Blob store is exercised against a real store in Task 17.

- [ ] **Step 9: Commit**

```bash
git add src/lib/store.ts src/lib/memory-store.ts src/lib/blob-store.ts tests/store.test.ts
git commit -m "$(cat <<'EOF'
feat: content store interface with memory and Vercel Blob implementations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Publish and rollback services

**Files:**
- Create: `src/lib/publish.ts`
- Test: `tests/publish.test.ts`

**Interfaces:**
- Consumes: `ContentStore`, `ConflictError` (Task 7); `ProgramContentSchema`, `Content` (Task 2); `isProgramSlug` (Task 2); `validateProgram`, `hasErrors`, `Issue` (Task 4); `finalizeCohortIds` (Task 4); `buildCohortsFeed` (Task 6).
- Produces:
  - `interface PublishInput { slug: string; draft: unknown; baseVersion: number; by: string; now?: Date }`
  - `type PublishResult = { ok: true; version: number; feedUpdated: boolean } | { ok: false; reason: 'invalid'; issues: Issue[] } | { ok: false; reason: 'conflict' } | { ok: false; reason: 'unknown-program' }`
  - `publishProgram(store: ContentStore, input: PublishInput): Promise<PublishResult>`
  - `interface RollbackInput { baseVersion: number; by: string; now?: Date }`
  - `type RollbackResult = { ok: true; version: number; restoredFrom: number; feedUpdated: boolean } | { ok: false; reason: 'conflict' | 'no-backup' }`
  - `rollbackLastPublish(store: ContentStore, input: RollbackInput): Promise<RollbackResult>`

- [ ] **Step 1: Write the failing tests**

`tests/publish.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '@/lib/memory-store'
import { publishProgram, rollbackLastPublish } from '@/lib/publish'
import { FEED_PATH } from '@/lib/store'
import { NOW, cohort, content, program } from './fixtures'

const by = 'hello@edubridgeacademy.com'
const slug = 'school-of-finance'
const edited = () => program({ cohorts: [cohort({ seatsRemaining: 5 })] })

describe('publishProgram', () => {
  it('saves the edit as a new version, backs up the old one and refreshes the feed', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: true, version: 2, feedUpdated: true })

    const { content: saved } = await store.readContent()
    expect(saved).toMatchObject({ version: 2, updatedBy: by, updatedAt: NOW.toISOString() })
    expect(saved.programs[slug]?.cohorts[0]?.seatsRemaining).toBe(5)

    const backups = await store.listBackups()
    expect(backups.map((b) => b.version)).toEqual([1])
    expect(await store.readBackup(backups[0]!.pathname)).toEqual(content())
    expect(store.files.get(FEED_PATH)).toMatchObject({ programs: { [slug]: { cohorts: [{ id: 'cohort-2027-q1' }] } } })
  })

  it('refuses with a conflict when someone published since the editor opened (stale baseVersion)', async () => {
    const store = createMemoryStore(content({ version: 3 }))
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 2, by, now: NOW })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
    expect((await store.readContent()).content.version).toBe(3)
    expect(await store.listBackups()).toEqual([])
  })

  it('refuses with a conflict when another publish lands mid-write', async () => {
    const store = createMemoryStore(content())
    const realRead = store.readContent
    store.readContent = async () => {
      const snapshot = await realRead()
      await store.writeContent({ ...snapshot.content, updatedBy: 'other tab' }, snapshot.etag)
      return snapshot
    }
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
    expect((await realRead()).content.updatedBy).toBe('other tab')
  })

  it('rejects invalid edits without writing anything', async () => {
    const store = createMemoryStore(content())
    const bad = program({ cohorts: [cohort({ endDate: '2027-01-01' })] })
    const result = await publishProgram(store, { slug, draft: bad, baseVersion: 1, by, now: NOW })
    if (result.ok || result.reason !== 'invalid') throw new Error(`expected invalid, got ${JSON.stringify(result)}`)
    expect(result.issues.map((i) => i.path)).toContain('cohorts.0.endDate')
    expect((await store.readContent()).content.version).toBe(1)
  })

  it('rejects a draft that is not shaped like program content', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: { ...program(), heroPriceLabel: 42 }, baseVersion: 1, by, now: NOW })
    if (result.ok || result.reason !== 'invalid') throw new Error('expected invalid')
    expect(result.issues[0]?.message).toMatch(/could not be read/)
  })

  it('does not allow pricing options to be removed', async () => {
    const store = createMemoryStore(content())
    const result = await publishProgram(store, { slug, draft: program({ pricing: [program().pricing[0]!] }), baseVersion: 1, by, now: NOW })
    expect(result.ok).toBe(false)
  })

  it('gives new cohorts permanent ids based on their start date', async () => {
    const store = createMemoryStore(content())
    const draft = program({
      cohorts: [cohort(), cohort({ id: 'new-abc', name: 'Q2 2027 Cohort', startDate: '2027-04-10', endDate: '2027-05-30' })],
    })
    await publishProgram(store, { slug, draft, baseVersion: 1, by, now: NOW })
    const { content: saved } = await store.readContent()
    expect(saved.programs[slug]?.cohorts.map((c) => c.id)).toEqual(['cohort-2027-q1', 'cohort-2027-q2'])
  })

  it('still publishes when the feed write fails, and says so', async () => {
    const store = createMemoryStore(content())
    store.writeFeed = async () => {
      throw new Error('blob down')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(result).toEqual({ ok: true, version: 2, feedUpdated: false })
    expect((await store.readContent()).content.version).toBe(2)
  })

  it('rejects programs outside the six', async () => {
    const store = createMemoryStore(content())
    expect(await publishProgram(store, { slug: 'corporate-training', draft: edited(), baseVersion: 1, by, now: NOW })).toEqual({
      ok: false,
      reason: 'unknown-program',
    })
  })
})

describe('rollbackLastPublish', () => {
  it('restores the version before the last publish, as a new version', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    const later = new Date('2026-10-14T13:00:00Z')

    const result = await rollbackLastPublish(store, { baseVersion: 2, by, now: later })
    expect(result).toEqual({ ok: true, version: 3, restoredFrom: 1, feedUpdated: true })

    const { content: live } = await store.readContent()
    expect(live).toMatchObject({ version: 3, updatedBy: by, updatedAt: later.toISOString() })
    expect(live.programs[slug]).toEqual(program())
    expect((await store.listBackups()).map((b) => b.version)).toEqual([2, 1])
  })

  it('reports when there is nothing to roll back to', async () => {
    const store = createMemoryStore(content())
    expect(await rollbackLastPublish(store, { baseVersion: 1, by, now: NOW })).toEqual({ ok: false, reason: 'no-backup' })
  })

  it('refuses with a conflict when the live version moved on', async () => {
    const store = createMemoryStore(content())
    await publishProgram(store, { slug, draft: edited(), baseVersion: 1, by, now: NOW })
    expect(await rollbackLastPublish(store, { baseVersion: 1, by, now: NOW })).toEqual({ ok: false, reason: 'conflict' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/publish.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement `publish.ts`**

`src/lib/publish.ts`:
```ts
import { finalizeCohortIds } from './cohort-ids'
import { buildCohortsFeed } from './cohorts-feed'
import { ProgramContentSchema, type Content } from './content-schema'
import { isProgramSlug } from './programs'
import { ConflictError, type ContentStore } from './store'
import { hasErrors, validateProgram, type Issue } from './validate'

export interface PublishInput {
  slug: string
  draft: unknown
  baseVersion: number
  by: string
  now?: Date
}
export type PublishResult =
  | { ok: true; version: number; feedUpdated: boolean }
  | { ok: false; reason: 'invalid'; issues: Issue[] }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'unknown-program' }

export interface RollbackInput {
  baseVersion: number
  by: string
  now?: Date
}
export type RollbackResult =
  | { ok: true; version: number; restoredFrom: number; feedUpdated: boolean }
  | { ok: false; reason: 'conflict' | 'no-backup' }

/** Write content (etag-guarded), then the derived feed. A failed feed write never undoes a publish. */
async function commit(store: ContentStore, next: Content, etag: string): Promise<{ ok: true; feedUpdated: boolean } | { ok: false }> {
  try {
    await store.writeContent(next, etag)
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false }
    throw error
  }
  try {
    await store.writeFeed(buildCohortsFeed(next))
    return { ok: true, feedUpdated: true }
  } catch (error) {
    console.error('cohorts-feed.json write failed; the next publish will rewrite it', error)
    return { ok: true, feedUpdated: false }
  }
}

export async function publishProgram(store: ContentStore, input: PublishInput): Promise<PublishResult> {
  if (!isProgramSlug(input.slug)) return { ok: false, reason: 'unknown-program' }
  const parsed = ProgramContentSchema.safeParse(input.draft)
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      issues: [{ path: '', level: 'error', message: 'The edit could not be read. Reload the page and try again' }],
    }
  }

  const now = input.now ?? new Date()
  const { content, etag } = await store.readContent()
  if (content.version !== input.baseVersion) return { ok: false, reason: 'conflict' }

  const draft = { ...parsed.data, cohorts: finalizeCohortIds(parsed.data.cohorts) }
  const issues = validateProgram(draft, { now, original: content.programs[input.slug] })
  if (hasErrors(issues)) return { ok: false, reason: 'invalid', issues }

  await store.writeBackup(content, now)
  const next: Content = {
    ...content,
    version: content.version + 1,
    updatedAt: now.toISOString(),
    updatedBy: input.by,
    programs: { ...content.programs, [input.slug]: draft },
  }
  const result = await commit(store, next, etag)
  return result.ok ? { ok: true, version: next.version, feedUpdated: result.feedUpdated } : { ok: false, reason: 'conflict' }
}

export async function rollbackLastPublish(store: ContentStore, input: RollbackInput): Promise<RollbackResult> {
  const now = input.now ?? new Date()
  const { content, etag } = await store.readContent()
  if (content.version !== input.baseVersion) return { ok: false, reason: 'conflict' }

  const target = (await store.listBackups()).find((b) => b.version < content.version)
  if (!target) return { ok: false, reason: 'no-backup' }
  const restored = await store.readBackup(target.pathname)

  await store.writeBackup(content, now)
  const next: Content = { ...restored, version: content.version + 1, updatedAt: now.toISOString(), updatedBy: input.by }
  const result = await commit(store, next, etag)
  return result.ok
    ? { ok: true, version: next.version, restoredFrom: target.version, feedUpdated: result.feedUpdated }
    : { ok: false, reason: 'conflict' }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/publish.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish.ts tests/publish.test.ts
git commit -m "$(cat <<'EOF'
feat: publish and rollback with backups, conflict guard and feed sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Landing-image validation and optimisation

**Files:**
- Create: `src/lib/hash.ts`, `src/lib/image.ts`
- Test: `tests/image.test.ts`

**Interfaces:**
- Consumes: `IMAGE_PREFIX` (Task 7).
- Produces: `sha16(bytes: Buffer): string`; `MAX_UPLOAD_BYTES = 4 * 1024 * 1024`, `MIN_WIDTH = 800`, `MIN_HEIGHT = 450`, `OUTPUT_MAX_WIDTH = 1600`; `type ImageResult = { ok: true; body: Buffer; contentType: 'image/webp'; hash: string } | { ok: false; message: string }`; `processLandingImage(input: Buffer): Promise<ImageResult>`; `imagePathname(slug: string, hash: string): string` → `images/<slug>-<hash>.webp`.

- [ ] **Step 1: Write the failing tests**

`tests/image.test.ts`:
```ts
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, imagePathname, processLandingImage } from '@/lib/image'

const make = (width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 80 } } })
    .toFormat(format)
    .toBuffer()

describe('processLandingImage', () => {
  it('re-encodes a valid photo to WebP', async () => {
    const result = await processLandingImage(await make(1200, 800))
    if (!result.ok) throw new Error(result.message)
    expect(result.contentType).toBe('image/webp')
    expect(result.hash).toMatch(/^[0-9a-f]{16}$/)
    const meta = await sharp(result.body).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(1200)
  })

  it('shrinks very large images to 1600px wide', async () => {
    const result = await processLandingImage(await make(3200, 2000, 'png'))
    if (!result.ok) throw new Error(result.message)
    expect((await sharp(result.body).metadata()).width).toBe(1600)
  })

  it.each(['png', 'webp'] as const)('accepts %s uploads', async (format) => {
    expect((await processLandingImage(await make(1000, 600, format))).ok).toBe(true)
  })

  it('rejects images smaller than 800×450', async () => {
    const result = await processLandingImage(await make(640, 480))
    expect(result).toEqual({ ok: false, message: 'Image is 640×480. It needs to be at least 800×450 pixels' })
  })

  it('rejects files that are not images, even if renamed', async () => {
    const result = await processLandingImage(Buffer.from('%PDF-1.7 not really an image'))
    expect(result).toEqual({ ok: false, message: "That file isn't a JPG, PNG or WebP image" })
  })

  it('rejects GIFs', async () => {
    expect(await processLandingImage(await make(1000, 600, 'gif'))).toEqual({
      ok: false,
      message: "That file isn't a JPG, PNG or WebP image",
    })
  })

  it('rejects files over 4 MB before decoding them', async () => {
    expect(await processLandingImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      message: 'That image is over 4 MB. Please use a smaller file',
    })
  })

  it('strips embedded metadata', async () => {
    const withExif = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#336699' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'private' } })
      .toBuffer()
    const result = await processLandingImage(withExif)
    if (!result.ok) throw new Error(result.message)
    expect((await sharp(result.body).metadata()).exif).toBeUndefined()
  })
})

describe('imagePathname', () => {
  it('names files by program and content hash', () => {
    expect(imagePathname('data-school', 'abcd')).toBe('images/data-school-abcd.webp')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/image.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement `hash.ts` and `image.ts`**

`src/lib/hash.ts`:
```ts
import { createHash } from 'node:crypto'

/** First 16 hex chars of SHA-256 — used in image filenames so uploads never collide. */
export function sha16(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}
```

`src/lib/image.ts`:
```ts
import sharp from 'sharp'
import { sha16 } from './hash'
import { IMAGE_PREFIX } from './store'

/** Vercel rejects request bodies over 4.5 MB, so the portal caps uploads at 4 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const MIN_WIDTH = 800
export const MIN_HEIGHT = 450
export const OUTPUT_MAX_WIDTH = 1600

export type ImageResult =
  | { ok: true; body: Buffer; contentType: 'image/webp'; hash: string }
  | { ok: false; message: string }

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])
const NOT_AN_IMAGE = "That file isn't a JPG, PNG or WebP image"

/**
 * Validate by decoding (never trust the file name or MIME type), then re-encode
 * to WebP. Re-encoding drops EXIF/metadata and anything hidden in the original bytes.
 */
export async function processLandingImage(input: Buffer): Promise<ImageResult> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, message: 'That image is over 4 MB. Please use a smaller file' }

  let meta: sharp.Metadata
  try {
    meta = await sharp(input).metadata()
  } catch {
    return { ok: false, message: NOT_AN_IMAGE }
  }
  if (!ACCEPTED_FORMATS.has(meta.format ?? '')) return { ok: false, message: NOT_AN_IMAGE }

  const rotated = (meta.orientation ?? 1) >= 5
  const width = (rotated ? meta.height : meta.width) ?? 0
  const height = (rotated ? meta.width : meta.height) ?? 0
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return { ok: false, message: `Image is ${width}×${height}. It needs to be at least ${MIN_WIDTH}×${MIN_HEIGHT} pixels` }
  }

  const body = await sharp(input)
    .rotate()
    .resize({ width: OUTPUT_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
  return { ok: true, body, contentType: 'image/webp', hash: sha16(body) }
}

export function imagePathname(slug: string, hash: string): string {
  return `${IMAGE_PREFIX}${slug}-${hash}.webp`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hash.ts src/lib/image.ts tests/image.test.ts
git commit -m "$(cat <<'EOF'
feat: validate and re-encode landing images with sharp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Seed and parity from the public repo

**Files:**
- Create: `src/lib/seed.ts`, `scripts/seed.ts`, `scripts/parity.ts`
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `PROGRAMS`, `ProgramInfo` (Task 2); `ProgramContentSchema`, `Content` (Task 2); `IMAGE_PREFIX` (Task 7); `sha16` (Task 9); `createBlobStore` (Task 7); `buildCohortsFeed` (Task 6).
- Produces: `interface SeedSource { readProgramData(slug): Promise<unknown>; readHomeData(): Promise<unknown>; readPublicFile(relPath): Promise<Buffer> }`, `type UploadImage = (pathname: string, body: Buffer, contentType: string) => Promise<string>`, `createFsSource(publicRepoDir: string): SeedSource`, `buildSeed(source, upload, now?): Promise<Content>`, `checkParity(content, source, fetchBytes: (url: string) => Promise<Buffer>): Promise<string[]>`. CLIs: `npm run seed -- --public-repo "<dir>" [--dry-run]`, `npm run parity -- --public-repo "<dir>"`.

- [ ] **Step 1: Write the failing tests**

`tests/seed.test.ts`:
```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sha16 } from '@/lib/hash'
import { PROGRAMS } from '@/lib/programs'
import { buildSeed, checkParity, createFsSource } from '@/lib/seed'
import { NOW, program } from './fixtures'

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value))
}

/** A miniature copy of ea-website-revamp with just the files the seed reads. */
async function makePublicRepo(options: { dropCard?: string } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ea-repo-'))
  const p = program()
  for (const info of PROGRAMS) {
    const sectionDir = join(dir, 'product', 'sections', info.slug)
    await mkdir(sectionDir, { recursive: true })
    await writeJson(join(sectionDir, 'data.json'), {
      heroContent: { heading: 'Heading', priceLabel: p.heroPriceLabel },
      cohorts: p.cohorts.map((c) => ({ ...c, extra: true })),
      pricing: p.pricing,
      faqs: [],
    })
  }
  await mkdir(join(dir, 'product', 'sections', 'home'), { recursive: true })
  const cards = [
    { id: 'prog-6', imageUrl: '/images/corporate.jpg' },
    ...PROGRAMS.map((info) => ({ id: info.homeCardId, imageUrl: `/images/${info.slug}.jpg` })),
  ].filter((c) => c.id !== options.dropCard)
  await writeJson(join(dir, 'product', 'sections', 'home', 'data.json'), { featuredPrograms: cards })
  await mkdir(join(dir, 'public', 'images'), { recursive: true })
  for (const info of PROGRAMS) await writeFile(join(dir, 'public', 'images', `${info.slug}.jpg`), Buffer.from(`jpeg bytes for ${info.slug}`))
  return dir
}

function fakeUploader() {
  const uploads = new Map<string, Buffer>()
  const upload = async (pathname: string, body: Buffer) => {
    uploads.set(pathname, body)
    return `https://blob.test/${pathname}`
  }
  const fetchBytes = async (url: string) => uploads.get(url.replace('https://blob.test/', '')) ?? Buffer.from('different bytes')
  return { uploads, upload, fetchBytes }
}

describe('buildSeed', () => {
  it('builds version 1 with all six programs from the public repo', async () => {
    const { upload } = fakeUploader()
    const seeded = await buildSeed(createFsSource(await makePublicRepo()), upload, NOW)
    expect(seeded).toMatchObject({ version: 1, updatedBy: 'seed', updatedAt: NOW.toISOString() })
    expect(Object.keys(seeded.programs)).toEqual(PROGRAMS.map((p) => p.slug))
    expect(seeded.programs['school-of-finance']?.cohorts).toEqual(program().cohorts)
    expect(seeded.programs['school-of-finance']?.pricing).toEqual(program().pricing)
    expect(seeded.programs['school-of-finance']?.heroPriceLabel).toBe(program().heroPriceLabel)
  })

  it('uploads the current card image unchanged under a hashed name', async () => {
    const { upload, uploads } = fakeUploader()
    const seeded = await buildSeed(createFsSource(await makePublicRepo()), upload, NOW)
    const bytes = Buffer.from('jpeg bytes for school-of-finance')
    const pathname = `images/school-of-finance-${sha16(bytes)}.jpg`
    expect(uploads.get(pathname)).toEqual(bytes)
    expect(seeded.programs['school-of-finance']?.landingImageUrl).toBe(`https://blob.test/${pathname}`)
  })

  it('names the homepage card it could not find', async () => {
    const { upload } = fakeUploader()
    await expect(buildSeed(createFsSource(await makePublicRepo({ dropCard: 'prog-hr' })), upload, NOW)).rejects.toThrow(/prog-hr/)
  })
})

describe('checkParity', () => {
  it('finds no differences in a fresh seed', async () => {
    const source = createFsSource(await makePublicRepo())
    const { upload, fetchBytes } = fakeUploader()
    const seeded = await buildSeed(source, upload, NOW)
    expect(await checkParity(seeded, source, fetchBytes)).toEqual([])
  })

  it('reports changed prices and images per program', async () => {
    const source = createFsSource(await makePublicRepo())
    const { upload, fetchBytes } = fakeUploader()
    const seeded = await buildSeed(source, upload, NOW)
    seeded.programs['data-school']!.pricing[0]!.amount = 1
    seeded.programs['school-of-finance']!.landingImageUrl = 'https://blob.test/other.jpg'
    expect(await checkParity(seeded, source, fetchBytes)).toEqual([
      'school-of-finance: landing image differs',
      'data-school: pricing differs',
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/seed.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement `seed.ts`**

`src/lib/seed.ts`:
```ts
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { ProgramContentSchema, type Content } from './content-schema'
import { sha16 } from './hash'
import { PROGRAMS, type ProgramInfo, type ProgramSlug } from './programs'
import { IMAGE_PREFIX } from './store'

/** Read access to the public site repo (ea-website-revamp). */
export interface SeedSource {
  readProgramData(slug: ProgramSlug): Promise<unknown>
  readHomeData(): Promise<unknown>
  readPublicFile(relPath: string): Promise<Buffer>
}
export type UploadImage = (pathname: string, body: Buffer, contentType: string) => Promise<string>

export function createFsSource(publicRepoDir: string): SeedSource {
  const readJson = async (...parts: string[]) => JSON.parse(await readFile(join(publicRepoDir, ...parts), 'utf8')) as unknown
  return {
    readProgramData: (slug) => readJson('product', 'sections', slug, 'data.json'),
    readHomeData: () => readJson('product', 'sections', 'home', 'data.json'),
    readPublicFile: (relPath) => readFile(join(publicRepoDir, 'public', relPath)),
  }
}

const SourceProgram = z.object({
  cohorts: z.array(z.unknown()),
  pricing: z.array(z.unknown()),
  heroContent: z.object({ priceLabel: z.string() }),
})
const SourceHome = z.object({
  featuredPrograms: z.array(z.object({ id: z.string(), imageUrl: z.string().nullable() })),
})
type SourceHomeData = z.infer<typeof SourceHome>

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** 'images/finance.jpg' — the card image path relative to the public folder. */
function cardImagePath(home: SourceHomeData, info: ProgramInfo): string {
  const card = home.featuredPrograms.find((c) => c.id === info.homeCardId)
  if (!card?.imageUrl) throw new Error(`Homepage card ${info.homeCardId} for ${info.slug} has no imageUrl`)
  return card.imageUrl.replace(/^\//, '')
}

function programFields(data: z.infer<typeof SourceProgram>) {
  const parsed = ProgramContentSchema.pick({ cohorts: true, pricing: true }).parse({ cohorts: data.cohorts, pricing: data.pricing })
  return { ...parsed, heroPriceLabel: data.heroContent.priceLabel }
}

/** Build content.json v1 from today's site data. Card images are uploaded byte-for-byte for exact parity. */
export async function buildSeed(source: SeedSource, upload: UploadImage, now: Date = new Date()): Promise<Content> {
  const home = SourceHome.parse(await source.readHomeData())
  const programs: Content['programs'] = {}
  for (const info of PROGRAMS) {
    const fields = programFields(SourceProgram.parse(await source.readProgramData(info.slug)))
    const relPath = cardImagePath(home, info)
    const ext = extname(relPath).toLowerCase()
    const contentType = CONTENT_TYPES[ext]
    if (!contentType) throw new Error(`Unsupported card image type for ${info.slug}: ${relPath}`)
    const bytes = await source.readPublicFile(relPath)
    const landingImageUrl = await upload(`${IMAGE_PREFIX}${info.slug}-${sha16(bytes)}${ext}`, bytes, contentType)
    programs[info.slug] = { ...fields, landingImageUrl }
  }
  return { version: 1, updatedAt: now.toISOString(), updatedBy: 'seed', programs }
}

/** Compare stored content with the public repo. Empty list = zero visible change. */
export async function checkParity(content: Content, source: SeedSource, fetchBytes: (url: string) => Promise<Buffer>): Promise<string[]> {
  const home = SourceHome.parse(await source.readHomeData())
  const problems: string[] = []
  for (const info of PROGRAMS) {
    const entry = content.programs[info.slug]
    if (!entry) {
      problems.push(`${info.slug}: missing from content.json`)
      continue
    }
    const expected = programFields(SourceProgram.parse(await source.readProgramData(info.slug)))
    const imageBytes = await source.readPublicFile(cardImagePath(home, info))
    if (!isDeepStrictEqual(entry.cohorts, expected.cohorts)) problems.push(`${info.slug}: cohorts differ`)
    if (!isDeepStrictEqual(entry.pricing, expected.pricing)) problems.push(`${info.slug}: pricing differs`)
    if (entry.heroPriceLabel !== expected.heroPriceLabel) problems.push(`${info.slug}: hero price label differs`)
    if (sha16(await fetchBytes(entry.landingImageUrl)) !== sha16(imageBytes)) problems.push(`${info.slug}: landing image differs`)
  }
  return problems
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/seed.test.ts`
Expected: PASS. The "reports changed prices" test expects programs in registry order; per program the checks run cohorts → pricing → hero → image.

- [ ] **Step 5: Write the CLI scripts**

`scripts/seed.ts`:
```ts
// One-time import of today's site data into the content store.
// Usage: npm run seed -- --public-repo "C:\path\to\ea-website-revamp" [--dry-run]
import { parseArgs } from 'node:util'
import { createBlobStore } from '../src/lib/blob-store'
import { buildCohortsFeed } from '../src/lib/cohorts-feed'
import { buildSeed, createFsSource } from '../src/lib/seed'

const { values } = parseArgs({
  options: { 'public-repo': { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
})
const repo = values['public-repo']
if (!repo) {
  console.error('Usage: npm run seed -- --public-repo "<path to ea-website-revamp>" [--dry-run]')
  process.exit(1)
}
const source = createFsSource(repo)

if (values['dry-run']) {
  const content = await buildSeed(source, async (pathname) => `https://dry-run.invalid/${pathname}`)
  console.log(JSON.stringify(content, null, 2))
} else {
  const store = createBlobStore()
  const content = await buildSeed(source, (pathname, body, type) => store.putImage(pathname, body, type))
  await store.createContent(content)
  await store.writeFeed(buildCohortsFeed(content))
  console.log(`Seeded content.json v${content.version} with ${Object.keys(content.programs).length} programs, plus cohorts-feed.json`)
}
```

`scripts/parity.ts`:
```ts
// Confirms the stored content matches the public repo exactly (run right after seeding).
// Usage: npm run parity -- --public-repo "C:\path\to\ea-website-revamp"
import { parseArgs } from 'node:util'
import { createBlobStore } from '../src/lib/blob-store'
import { checkParity, createFsSource } from '../src/lib/seed'

const { values } = parseArgs({ options: { 'public-repo': { type: 'string' } } })
const repo = values['public-repo']
if (!repo) {
  console.error('Usage: npm run parity -- --public-repo "<path to ea-website-revamp>"')
  process.exit(1)
}
const { content } = await createBlobStore().readContent()
const problems = await checkParity(content, createFsSource(repo), async (url) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
})
if (problems.length > 0) {
  console.error(`Parity check FAILED:\n${problems.map((p) => ` - ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('Parity check passed: content.json matches the public site data for all 6 programs.')
```

- [ ] **Step 6: Dry-run the seed against the real public repo**

Run (Bash):
```bash
npx tsx scripts/seed.ts --public-repo "/c/Users/okoro/Documents/EA Website Revamp/ea-website-revamp" --dry-run | head -40
```
Expected: JSON with `"version": 1`, six programs, Finance's last cohort `2027-01-23`, image URLs `https://dry-run.invalid/images/school-of-finance-<16 hex>.jpg`. No network calls are made.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck && npm test
git add src/lib/seed.ts scripts/seed.ts scripts/parity.ts tests/seed.test.ts
git commit -m "$(cat <<'EOF'
feat: seed content.json from the public site and check parity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Google sign-in, allowlist, route protection and demo mode

**Files:**
- Create: `src/lib/allowlist.ts`, `src/lib/demo.ts`, `src/lib/session.ts`, `src/lib/store-instance.ts`, `src/auth.ts`, `src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`
- Modify: `src/app/globals.css` (append login styles)
- Test: `tests/allowlist.test.ts`

**Interfaces:**
- Consumes: `createBlobStore`, `createMemoryStore`, `NotSeededError`, `ContentStore` (Task 7); `buildSeed`, `createFsSource` (Task 10).
- Produces:
  - `parseAllowlist(raw: string | undefined): string[]`, `isAllowedEmail(email: string | null | undefined, allowlist: string[]): boolean`, `allowGoogleSignIn(provider: string | undefined, profile: { email?: string | null; email_verified?: boolean | null } | undefined, allowlist: string[]): boolean`
  - `isDemoMode(): boolean`. True only when `NODE_ENV !== 'production'` and `ADMIN_DEMO === '1'`.
  - `class UnauthorizedError`, `requireAdmin(): Promise<string>` (lower-cased email; `'demo@localhost'` in demo mode)
  - `getStore(): Promise<ContentStore>`, `readContentOrNull(): Promise<{ content: Content; etag: string } | null>`
  - `handlers`, `auth`, `signIn`, `signOut` from `@/auth`

- [ ] **Step 1: Write the failing tests**

`tests/allowlist.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowGoogleSignIn, isAllowedEmail, parseAllowlist } from '@/lib/allowlist'
import { isDemoMode } from '@/lib/demo'

const list = parseAllowlist(' Hello@EduBridgeAcademy.com , ,other@example.com ')

describe('allowlist', () => {
  it('parses a comma-separated, case-insensitive list', () => {
    expect(list).toEqual(['hello@edubridgeacademy.com', 'other@example.com'])
    expect(parseAllowlist(undefined)).toEqual([])
  })

  it('matches emails regardless of case and spacing', () => {
    expect(isAllowedEmail(' HELLO@edubridgeacademy.com', list)).toBe(true)
    expect(isAllowedEmail('someone@gmail.com', list)).toBe(false)
    expect(isAllowedEmail(undefined, list)).toBe(false)
  })

  it('lets in only the verified, allowlisted Google account', () => {
    expect(allowGoogleSignIn('google', { email: 'hello@edubridgeacademy.com', email_verified: true }, list)).toBe(true)
    expect(allowGoogleSignIn('google', { email: 'hello@edubridgeacademy.com', email_verified: false }, list)).toBe(false)
    expect(allowGoogleSignIn('google', { email: 'intruder@gmail.com', email_verified: true }, list)).toBe(false)
    expect(allowGoogleSignIn('github', { email: 'hello@edubridgeacademy.com', email_verified: true }, list)).toBe(false)
    expect(allowGoogleSignIn('google', { email: 'hello@edubridgeacademy.com', email_verified: true }, [])).toBe(false)
  })
})

describe('isDemoMode', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off unless explicitly enabled', () => {
    vi.stubEnv('ADMIN_DEMO', '')
    expect(isDemoMode()).toBe(false)
  })
  it('is on in development when ADMIN_DEMO=1', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEMO', '1')
    expect(isDemoMode()).toBe(true)
  })
  it('can never be on in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_DEMO', '1')
    expect(isDemoMode()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/allowlist.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `allowlist.ts` and `demo.ts`**

`src/lib/allowlist.ts`:
```ts
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedEmail(email: string | null | undefined, allowlist: string[]): boolean {
  return !!email && allowlist.includes(email.trim().toLowerCase())
}

/** Spec §5: Google only, email_verified must be true, and the email must be allowlisted. */
export function allowGoogleSignIn(
  provider: string | undefined,
  profile: { email?: string | null; email_verified?: boolean | null } | undefined,
  allowlist: string[],
): boolean {
  return provider === 'google' && profile?.email_verified === true && isAllowedEmail(profile.email, allowlist)
}
```

`src/lib/demo.ts`:
```ts
/**
 * Local demo mode: full UI against an in-memory store, no Google sign-in.
 * Production builds (`next build` / Vercel) always run with NODE_ENV=production,
 * so this can never be switched on in a deployed portal.
 */
export function isDemoMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ADMIN_DEMO === '1'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/allowlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement Auth.js config, proxy and auth route**

`src/auth.ts`:
```ts
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { allowGoogleSignIn, parseAllowlist } from '@/lib/allowlist'

// Reads AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and AUTH_SECRET from the environment.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  callbacks: {
    signIn: ({ account, profile }) => allowGoogleSignIn(account?.provider, profile, parseAllowlist(process.env.ALLOWED_EMAILS)),
  },
})
```

`src/proxy.ts`:
```ts
import { auth } from '@/auth'
import { isAllowedEmail, parseAllowlist } from '@/lib/allowlist'
import { isDemoMode } from '@/lib/demo'

// Every page and API route except sign-in itself requires the allowlisted session.
// Pages and server actions re-check with requireAdmin(); this is the first gate, not the only one.
export const proxy = auth((req) => {
  if (isDemoMode()) return
  if (!isAllowedEmail(req.auth?.user?.email, parseAllowlist(process.env.ALLOWED_EMAILS))) {
    return Response.redirect(new URL('/login', req.nextUrl.origin))
  }
})

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
}
```

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 6: Implement `session.ts` and `store-instance.ts`**

`src/lib/session.ts`:
```ts
import 'server-only'
import { auth } from '@/auth'
import { isAllowedEmail, parseAllowlist } from './allowlist'
import { isDemoMode } from './demo'

export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in as an allowed admin')
    this.name = 'UnauthorizedError'
  }
}

/** Re-checked on every page load and write, so removing an email from ALLOWED_EMAILS revokes access. */
export async function requireAdmin(): Promise<string> {
  if (isDemoMode()) return 'demo@localhost'
  const session = await auth()
  const email = session?.user?.email
  if (!email || !isAllowedEmail(email, parseAllowlist(process.env.ALLOWED_EMAILS))) throw new UnauthorizedError()
  return email.trim().toLowerCase()
}
```

`src/lib/store-instance.ts`:
```ts
import 'server-only'
import { createBlobStore } from './blob-store'
import type { Content } from './content-schema'
import { isDemoMode } from './demo'
import { createMemoryStore } from './memory-store'
import { buildSeed, createFsSource } from './seed'
import { NotSeededError, type ContentStore } from './store'

// Cached on globalThis so dev-server hot reloads keep the same demo store.
const cache = globalThis as typeof globalThis & { __eduStore?: Promise<ContentStore> }

async function createDemoStore(): Promise<ContentStore> {
  const repo = process.env.DEMO_PUBLIC_REPO
  if (!repo) throw new Error('Set DEMO_PUBLIC_REPO to the ea-website-revamp folder to use ADMIN_DEMO=1')
  const store = createMemoryStore()
  await store.createContent(await buildSeed(createFsSource(repo), (p, body, type) => store.putImage(p, body, type)))
  return store
}

export function getStore(): Promise<ContentStore> {
  cache.__eduStore ??= isDemoMode() ? createDemoStore() : Promise.resolve(createBlobStore())
  return cache.__eduStore
}

export async function readContentOrNull(): Promise<{ content: Content; etag: string } | null> {
  try {
    return await (await getStore()).readContent()
  } catch (error) {
    if (error instanceof NotSeededError) return null
    throw error
  }
}
```

- [ ] **Step 7: Build the login page**

`src/app/login/page.tsx`:
```tsx
import { signIn } from '@/auth'

const MESSAGES: Record<string, string> = {
  AccessDenied: 'Not authorized. Sign in with the EduBridge admin Google account.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="login">
      <div className="login-card">
        <span className="login-mark" aria-hidden>
          E
        </span>
        <div>
          <h1>EduBridge Admin</h1>
          <p className="muted">Update program dates, prices and images.</p>
        </div>
        {error && (
          <p className="login-error" role="alert">
            {MESSAGES[error] ?? 'Sign-in failed. Please try again.'}
          </p>
        )}
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/' })
          }}
        >
          <button type="submit" className="btn btn-primary login-btn">
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  )
}
```

Append to `src/app/globals.css`:
```css
/* login */
.login {
  min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
  background: radial-gradient(900px 420px at 80% -10%, rgba(21, 75, 84, .06), transparent 60%), var(--canvas);
}
.login-card {
  width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 18px; text-align: center;
  background: var(--panel); border: 1px solid var(--border-soft); border-radius: 18px; box-shadow: var(--shadow); padding: 32px 28px;
}
.login-card h1 { font-size: 20px; margin-bottom: 4px; }
.login-mark {
  width: 44px; height: 44px; margin: 0 auto; border-radius: 12px; display: grid; place-items: center;
  color: #fff; font-weight: 700; background: linear-gradient(140deg, var(--green), var(--green-deep));
}
.login-error { background: var(--danger-bg); color: var(--danger); border-radius: 10px; padding: 10px 12px; font-size: 13px; }
.login-btn { width: 100%; }
```

- [ ] **Step 8: Verify the gate locally**

Create `.env.local` (never committed) with `npx auth secret` (writes `AUTH_SECRET`), plus placeholder `AUTH_GOOGLE_ID=placeholder`, `AUTH_GOOGLE_SECRET=placeholder`, `ALLOWED_EMAILS=hello@edubridgeacademy.com`.

Run: `npm run build && npm run typecheck && npm test`, then `npm run dev` in the background and:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
curl -s "http://localhost:3000/login?error=AccessDenied" | grep -o "Not authorized[^<]*"
```
Expected: `/` → `302 http://localhost:3000/login`; `/login` → `200`; the third prints the "Not authorized" message. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/lib/allowlist.ts src/lib/demo.ts src/lib/session.ts src/lib/store-instance.ts src/auth.ts src/proxy.ts "src/app/api/auth/[...nextauth]/route.ts" src/app/login/page.tsx src/app/globals.css tests/allowlist.test.ts
git commit -m "$(cat <<'EOF'
feat: Google sign-in locked to the admin allowlist, route protection, demo mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Console shell and Programs dashboard (three-pane)

**Files:**
- Create: `src/components/Sidebar.tsx`, `src/components/StatusPill.tsx`, `src/components/ProgramRow.tsx`, `src/components/ProgramDetail.tsx`, `src/components/NotSeeded.tsx`, `src/app/actions.ts`, `src/app/(console)/layout.tsx`, `src/app/(console)/page.tsx`
- Delete: `src/app/page.tsx`
- Modify: `src/app/globals.css` (append console styles)

**Interfaces:**
- Consumes: `requireAdmin`, `UnauthorizedError` (Task 11); `getStore`, `readContentOrNull` (Task 11); `recentPublishes`, `RecentPublish` (Task 7); `PROGRAMS`, `getProgram`, `liveUrl`, `PUBLIC_SITE_URL`, `ProgramInfo` (Task 2); `nextOpenCohort`, `programPill`, `heroNextCohortLabel`, `ProgramPill` (Task 3); `formatDay`, `formatNaira`, `formatStamp` (Task 3); `CohortStatus` (Task 3); `signOut` (Task 11).
- Produces: `<StatusPill status={'open'|'full'|'ended'|'none'} />`; `signOutAction()` in `src/app/actions.ts` (Tasks 14–15 add more actions to this file); `<NotSeeded />`; CSS classes `.app .side .panes .panes-single .pane-main .pane-detail .phead .psub .list .row .actions .detail-title .facts` reused by later tasks.

- [ ] **Step 1: Confirm the icon names exist in lucide-react 1.57.0**

Run:
```bash
node -e "const l=require('lucide-react'); console.log(['LayoutGrid','History','ExternalLink','LogOut','ArrowLeft','Plus','Trash2','Upload','TriangleAlert','RotateCcw'].filter(n=>!l[n]))"
```
Expected: `[]`. If a name is missing, use the closest equivalent from the package's exports, and use it consistently in Tasks 12–15.

- [ ] **Step 2: Write `StatusPill`, `NotSeeded` and the sign-out action**

`src/components/StatusPill.tsx`:
```tsx
import type { CohortStatus } from '@/lib/cohort-status'
import type { ProgramPill } from '@/lib/next-cohort'

const LABELS: Record<CohortStatus | ProgramPill, string> = {
  open: 'Open',
  full: 'Full',
  ended: 'Ended',
  none: 'No upcoming cohort',
}

export function StatusPill({ status }: { status: CohortStatus | ProgramPill }) {
  return <span className={`pill pill-${status}`}>{LABELS[status]}</span>
}
```

`src/components/NotSeeded.tsx`:
```tsx
export function NotSeeded() {
  return (
    <div className="panes panes-single">
      <section className="pane-main">
        <h1>No content yet</h1>
        <p className="psub">
          The content store is empty. A developer needs to run <code>npm run seed</code> once (see the README).
        </p>
      </section>
    </div>
  )
}
```

`src/app/actions.ts`:
```ts
'use server'

import { signOut } from '@/auth'

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
```

- [ ] **Step 3: Write the Sidebar**

`src/components/Sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, History, LayoutGrid, LogOut } from 'lucide-react'
import { signOutAction } from '@/app/actions'
import { formatStamp } from '@/lib/format'
import { PUBLIC_SITE_URL } from '@/lib/programs'
import type { RecentPublish } from '@/lib/store'

const NAV = [
  { href: '/', label: 'Programs', Icon: LayoutGrid, isActive: (p: string) => p === '/' || p.startsWith('/programs') },
  { href: '/history', label: 'Publish history', Icon: History, isActive: (p: string) => p.startsWith('/history') },
]

export function Sidebar({ email, recent }: { email: string; recent: RecentPublish[] }) {
  const pathname = usePathname()
  return (
    <aside className="side" aria-label="Sidebar">
      <div className="acct">
        <span className="av" aria-hidden>
          EA
        </span>
        <span className="who">
          <b>{email}</b>
          <span>EduBridge admin</span>
        </span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map(({ href, label, Icon, isActive }) => (
          <Link key={href} href={href} aria-current={isActive(pathname) ? 'page' : undefined}>
            <Icon size={17} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
      {recent.length > 0 && (
        <section className="recent" aria-label="Recent publishes">
          <h2 className="side-label">Recent publishes</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.version}>
                <span className="dot">v{r.version}</span>
                <span>
                  <b>Published</b>
                  <span>{formatStamp(r.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="side-foot">
        <a className="btn btn-outline" href={PUBLIC_SITE_URL} target="_blank" rel="noreferrer">
          <ExternalLink size={15} aria-hidden /> View live site
        </a>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-ghost">
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Write `ProgramRow` and `ProgramDetail`**

`src/components/ProgramRow.tsx`:
```tsx
import Link from 'next/link'
import { StatusPill } from './StatusPill'
import type { ProgramContent } from '@/lib/content-schema'
import { formatDay, formatNaira } from '@/lib/format'
import { nextOpenCohort, programPill } from '@/lib/next-cohort'
import type { ProgramInfo } from '@/lib/programs'

interface Props {
  info: ProgramInfo
  entry: ProgramContent | undefined
  selected: boolean
  now: Date
}

export function ProgramRow({ info, entry, selected, now }: Props) {
  if (!entry) {
    return (
      <li className="row row-missing">
        <span className="nm">
          <b>{info.name}</b>
          <span>Not in the content store yet</span>
        </span>
      </li>
    )
  }
  const next = nextOpenCohort(entry.cohorts, now)
  const full = entry.pricing.find((p) => p.id === 'full')
  return (
    <li>
      <Link href={`/?p=${info.slug}`} scroll={false} className="row" aria-current={selected ? 'true' : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
        <img className="thumb" src={entry.landingImageUrl} alt="" />
        <span className="nm">
          <b>{info.name}</b>
          <span>{entry.cohorts.length} cohorts on file</span>
        </span>
        <span className="chip">{full ? formatNaira(full.amount) : '—'}</span>
        <span className="when">
          {next ? formatDay(next.startDate) : '—'}
          <span>Next start</span>
        </span>
        <StatusPill status={programPill(entry.cohorts, now)} />
      </Link>
    </li>
  )
}
```

`src/components/ProgramDetail.tsx`:
```tsx
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { ProgramContent } from '@/lib/content-schema'
import { formatDay } from '@/lib/format'
import { heroNextCohortLabel, nextOpenCohort } from '@/lib/next-cohort'
import { liveUrl, type ProgramInfo } from '@/lib/programs'

export function ProgramDetail({ info, entry, now }: { info: ProgramInfo; entry: ProgramContent | undefined; now: Date }) {
  if (!entry) {
    return (
      <aside className="pane-detail">
        <p className="muted">No content for this program yet.</p>
      </aside>
    )
  }
  const next = nextOpenCohort(entry.cohorts, now)
  const price = (id: string) => entry.pricing.find((p) => p.id === id)?.priceLabel ?? '—'
  return (
    <aside className="pane-detail" aria-label={`${info.name} summary`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
      <img className="detail-img" src={entry.landingImageUrl} alt={`${info.name} landing image`} />
      <div>
        <h2 className="detail-title">{info.name}</h2>
        <p className="meta">{liveUrl(info).replace('https://www.', '')}</p>
      </div>
      <dl className="facts">
        <div>
          <dt>Next cohort</dt>
          <dd>{next ? formatDay(next.startDate) : 'None open'}</dd>
        </div>
        <div>
          <dt>Seats left</dt>
          <dd>{next ? `${next.seatsRemaining} of ${next.totalSeats}` : '—'}</dd>
        </div>
        <div>
          <dt>Pay in full</dt>
          <dd>{price('full')}</dd>
        </div>
        <div>
          <dt>Installments</dt>
          <dd>{price('installments')}</dd>
        </div>
        <div className="wide">
          <dt>Hero price label</dt>
          <dd>{entry.heroPriceLabel}</dd>
        </div>
        <div className="wide">
          <dt>Program page will show</dt>
          <dd>{heroNextCohortLabel(next)}</dd>
        </div>
      </dl>
      <div className="actions">
        <a className="btn btn-outline" href={liveUrl(info)} target="_blank" rel="noreferrer">
          View live page <ExternalLink size={14} aria-hidden />
        </a>
        <Link className="btn btn-primary" href={`/programs/${info.slug}`}>
          Edit program
        </Link>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Write the console layout and dashboard page; delete the placeholder**

```bash
git rm -q src/app/page.tsx
```

`src/app/(console)/layout.tsx`:
```tsx
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { requireAdmin, UnauthorizedError } from '@/lib/session'
import { recentPublishes } from '@/lib/store'
import { getStore } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  let email: string
  try {
    email = await requireAdmin()
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login')
    throw error
  }
  const backups = await (await getStore()).listBackups()
  return (
    <div className="app">
      <Sidebar email={email} recent={recentPublishes(backups)} />
      <main className="main">{children}</main>
    </div>
  )
}
```

`src/app/(console)/page.tsx`:
```tsx
import { NotSeeded } from '@/components/NotSeeded'
import { ProgramDetail } from '@/components/ProgramDetail'
import { ProgramRow } from '@/components/ProgramRow'
import { formatStamp } from '@/lib/format'
import { PROGRAMS, getProgram } from '@/lib/programs'
import { readContentOrNull } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const { content } = loaded
  const now = new Date()
  const selected = getProgram(p ?? '') ?? PROGRAMS[0]!
  const publishedBy = content.updatedBy === 'seed' ? 'Imported from the website' : `Last published by ${content.updatedBy}`

  return (
    <div className="panes">
      <section className="pane-main">
        <header className="phead">
          <h1>Programs</h1>
          <span className="meta">
            {publishedBy} · {formatStamp(content.updatedAt)} · version {content.version}
          </span>
        </header>
        <ul className="list">
          {PROGRAMS.map((info) => (
            <ProgramRow key={info.slug} info={info} entry={content.programs[info.slug]} selected={info.slug === selected.slug} now={now} />
          ))}
        </ul>
      </section>
      <ProgramDetail info={selected} entry={content.programs[selected.slug]} now={now} />
    </div>
  )
}
```

- [ ] **Step 6: Append console styles to `src/app/globals.css`**

```css
/* console shell — three panes, after the user's reference layout */
.app { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; background: var(--bg); }
.main { min-width: 0; }
.side {
  position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; gap: 22px;
  padding: 22px 14px; background: var(--bg); border-right: 1px solid var(--border-soft);
}
.acct { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
.av {
  flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff;
  font-weight: 700; font-size: 13px; background: linear-gradient(140deg, var(--green), var(--green-deep));
  box-shadow: 0 6px 14px -6px rgba(94, 178, 41, .55);
}
.who { min-width: 0; }
.who b { display: block; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who span { display: block; font-size: 11px; color: var(--faint); }
.nav { display: flex; flex-direction: column; gap: 3px; }
.nav a {
  position: relative; display: flex; align-items: center; gap: 11px; padding: 9px 11px; border-radius: 10px;
  color: var(--muted); font-weight: 500; font-size: 13.5px; text-decoration: none;
}
.nav a:hover { background: var(--panel-2); color: var(--fg); }
.nav a[aria-current='page'] { background: var(--open-bg); color: var(--green-deep); font-weight: 600; }
.nav a[aria-current='page']::before {
  content: ''; position: absolute; left: -14px; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: var(--green);
}
.side-label { margin: 0 11px 8px; font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); font-weight: 600; }
.recent ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.recent li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border-soft); }
.recent .dot { flex: none; width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: var(--open-bg); color: var(--green-deep); font-size: 11px; font-weight: 700; }
.recent b { display: block; font-size: 12.5px; font-weight: 600; }
.recent li span span { display: block; font-size: 11px; color: var(--faint); }
.side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.side-foot form { display: contents; }

.panes { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 100vh; }
.panes-single { grid-template-columns: minmax(0, 1fr); }
.pane-main { min-width: 0; padding: 28px 28px 40px; background: var(--canvas); }
.pane-detail {
  position: sticky; top: 0; height: 100vh; overflow-y: auto; min-width: 0; display: flex; flex-direction: column; gap: 18px;
  padding: 24px; background: var(--bg); border-left: 1px solid var(--border-soft);
}
.phead { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 18px; }
.phead h1 { font-size: 23px; }
.psub { color: var(--muted); font-size: 13.5px; max-width: 62ch; margin-bottom: 18px; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.row {
  display: grid; grid-template-columns: 48px minmax(0, 1fr) auto 104px 132px; align-items: center; gap: 16px; padding: 12px 16px;
  background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius); box-shadow: var(--shadow-sm);
  text-decoration: none; transition: border-color .15s, box-shadow .15s, transform .15s;
}
.row:hover { border-color: var(--border); box-shadow: var(--shadow); transform: translateY(-1px); }
.row[aria-current='true'] { border-color: var(--green); box-shadow: var(--ring), var(--shadow); }
.row > .pill { justify-self: end; }
.row-missing { grid-template-columns: minmax(0, 1fr); }
.thumb { width: 48px; height: 48px; border-radius: 11px; object-fit: cover; background: var(--raise); }
.nm { min-width: 0; }
.nm b { display: block; font-weight: 600; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm span { display: block; margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.chip { padding: 4px 10px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border-soft); font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.when { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.when span { display: block; font-size: 11px; font-weight: 500; color: var(--faint); }

.detail-img { width: 100%; max-width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 14px; background: var(--raise); box-shadow: var(--shadow-sm); }
.detail-title { font-size: 17px; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 0; }
.facts dt { font-size: 11px; color: var(--faint); font-weight: 500; }
.facts dd { margin: 3px 0 0; font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.facts .wide { grid-column: 1 / -1; }
.actions { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

@media (max-width: 1180px) {
  .panes { grid-template-columns: minmax(0, 1fr); }
  .pane-detail { position: static; height: auto; border-left: 0; border-top: 1px solid var(--border-soft); }
  .actions { margin-top: 0; }
}
@media (max-width: 760px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--border-soft); }
  .side .recent, .who span, .side-foot .btn-ghost { display: none; }
  .acct { padding: 0; flex: 1 1 100%; }
  .nav { flex-direction: row; flex-wrap: wrap; }
  .nav a[aria-current='page']::before { display: none; }
  .side-foot { margin: 0 0 0 auto; }
  .pane-main { padding: 20px 16px 32px; }
  .pane-detail { padding: 20px 16px; }
  .row { grid-template-columns: 48px minmax(0, 1fr) auto; gap: 12px; padding: 12px; }
  .row .chip, .row .when { display: none; }
}
```

- [ ] **Step 7: Verify in demo mode and compare with the reference**

Add to `.env.local`:
```bash
ADMIN_DEMO=1
DEMO_PUBLIC_REPO=C:\Users\okoro\Documents\EA Website Revamp\ea-website-revamp
```
Run: `npm run typecheck && npm test && npm run build`, then `npm run dev` (background).
With the Playwright MCP tools: navigate to `http://localhost:3000/`, screenshot at 1440×900 and at 390×844; click the Data School row and confirm the right panel updates and the row gets the green ring.
Expected: six rows with real images, prices and next-start dates (Finance `23 Jan 2027`, Open); detail panel shows "Program page will show: Next cohort starts Saturday, 23 January 2027"; no horizontal scroll at 390 px. The layout matches the design preview artifact. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add -A src/app src/components
git commit -m "$(cat <<'EOF'
feat: three-pane console shell and programs dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Program editor (draft state, cohorts, pricing, image tabs)

**Files:**
- Create: `src/lib/draft-reducer.ts`, `src/components/editor/ProgramEditor.tsx`, `src/components/editor/CohortsTab.tsx`, `src/components/editor/PricingTab.tsx`, `src/components/editor/ImageTab.tsx`, `src/components/editor/FieldError.tsx`, `src/app/(console)/programs/[slug]/page.tsx`
- Modify: `src/app/globals.css` (append editor styles)
- Test: `tests/draft-reducer.test.ts`

**Interfaces:**
- Consumes: `ProgramContent`, `Cohort`, `CohortFormat`, `COHORT_FORMATS` (Task 2); `NEW_COHORT_PREFIX`, `suggestCohortName` (Task 4); `validateProgram`, `Issue` (Task 4); `getCohortStatus` (Task 3); `isRealDate` (Task 3); `StatusPill` (Task 12); `readContentOrNull` (Task 11); `NotSeeded` (Task 12); `getProgram`, `liveUrl`, `ProgramInfo` (Task 2).
- Produces:
  - `type DraftAction` and `draftReducer(state: ProgramContent, action: DraftAction): ProgramContent`. Actions: `cohort/add {id}`, `cohort/text {index, field: 'name'|'startDate'|'endDate', value}`, `cohort/format {index, value: CohortFormat}`, `cohort/number {index, field: 'seatsRemaining'|'totalSeats', value: number}`, `cohort/remove {index}`, `pricing/text {index, field: 'title'|'priceLabel'|'description', value}`, `pricing/amount {index, value: number}`, `heroPriceLabel {value}`, `image {url}`, `reset {value: ProgramContent}`
  - `<ProgramEditor info initial baseVersion nowIso publishedVersion feedWarning />` (renders `<ReviewPanel>` from Task 14; until then a placeholder aside)
  - `<FieldError issues path />`

- [ ] **Step 1: Write the failing reducer tests**

`tests/draft-reducer.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { draftReducer } from '@/lib/draft-reducer'
import { cohort, program } from './fixtures'

describe('draftReducer', () => {
  it('adds a blank cohort that copies the last cohort’s seats and format', () => {
    const next = draftReducer(program(), { type: 'cohort/add', id: 'new-1' })
    expect(next.cohorts[1]).toEqual({ id: 'new-1', name: '', startDate: '', endDate: '', format: 'hybrid', seatsRemaining: 50, totalSeats: 50 })
  })

  it('names a new cohort from its start date', () => {
    let s = draftReducer(program(), { type: 'cohort/add', id: 'new-1' })
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'startDate', value: '2027-04-10' })
    expect(s.cohorts[1]?.name).toBe('Q2 2027 Cohort')
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'startDate', value: '2027-07-10' })
    expect(s.cohorts[1]?.name).toBe('Q3 2027 Cohort')
  })

  it('never renames existing cohorts or names typed by staff', () => {
    let s = draftReducer(program(), { type: 'cohort/text', index: 0, field: 'startDate', value: '2027-04-10' })
    expect(s.cohorts[0]?.name).toBe('Q1 2027 Cohort')
    s = draftReducer(s, { type: 'cohort/add', id: 'new-1' })
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'name', value: 'Easter Bootcamp' })
    s = draftReducer(s, { type: 'cohort/text', index: 1, field: 'startDate', value: '2027-04-10' })
    expect(s.cohorts[1]?.name).toBe('Easter Bootcamp')
  })

  it('keeps a cleared number as NaN so validation catches it', () => {
    const s = draftReducer(program(), { type: 'cohort/number', index: 0, field: 'seatsRemaining', value: Number.NaN })
    expect(Number.isNaN(s.cohorts[0]?.seatsRemaining)).toBe(true)
  })

  it('updates format, removes cohorts and edits pricing', () => {
    let s = draftReducer(program({ cohorts: [cohort(), cohort({ id: 'b' })] }), { type: 'cohort/format', index: 0, value: 'virtual' })
    expect(s.cohorts[0]?.format).toBe('virtual')
    s = draftReducer(s, { type: 'cohort/remove', index: 0 })
    expect(s.cohorts.map((c) => c.id)).toEqual(['b'])
    s = draftReducer(s, { type: 'pricing/text', index: 1, field: 'priceLabel', value: '2 × ₦90,000' })
    s = draftReducer(s, { type: 'pricing/amount', index: 1, value: 90000 })
    expect(s.pricing[1]).toMatchObject({ priceLabel: '2 × ₦90,000', amount: 90000 })
  })

  it('sets the hero label and image, and resets to a given program', () => {
    let s = draftReducer(program(), { type: 'heroPriceLabel', value: 'x' })
    s = draftReducer(s, { type: 'image', url: 'https://x/new.webp' })
    expect(s).toMatchObject({ heroPriceLabel: 'x', landingImageUrl: 'https://x/new.webp' })
    expect(draftReducer(s, { type: 'reset', value: program() })).toEqual(program())
  })

  it('never mutates the previous state', () => {
    const before = program()
    const snapshot = structuredClone(before)
    draftReducer(before, { type: 'cohort/number', index: 0, field: 'totalSeats', value: 99 })
    draftReducer(before, { type: 'pricing/amount', index: 0, value: 1 })
    expect(before).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/draft-reducer.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Implement the reducer**

`src/lib/draft-reducer.ts`:
```ts
import { NEW_COHORT_PREFIX, suggestCohortName } from './cohort-ids'
import type { Cohort, CohortFormat, ProgramContent } from './content-schema'

export type DraftAction =
  | { type: 'cohort/add'; id: string }
  | { type: 'cohort/text'; index: number; field: 'name' | 'startDate' | 'endDate'; value: string }
  | { type: 'cohort/format'; index: number; value: CohortFormat }
  | { type: 'cohort/number'; index: number; field: 'seatsRemaining' | 'totalSeats'; value: number }
  | { type: 'cohort/remove'; index: number }
  | { type: 'pricing/text'; index: number; field: 'title' | 'priceLabel' | 'description'; value: string }
  | { type: 'pricing/amount'; index: number; value: number }
  | { type: 'heroPriceLabel'; value: string }
  | { type: 'image'; url: string }
  | { type: 'reset'; value: ProgramContent }

function replaceAt<T>(items: T[], index: number, update: (item: T) => T): T[] {
  return items.map((item, i) => (i === index ? update(item) : item))
}

function setCohortText(c: Cohort, field: 'name' | 'startDate' | 'endDate', value: string): Cohort {
  const next = { ...c, [field]: value }
  const autoNamed = c.name === '' || c.name === suggestCohortName(c.startDate)
  if (field === 'startDate' && c.id.startsWith(NEW_COHORT_PREFIX) && autoNamed) next.name = suggestCohortName(value)
  return next
}

export function draftReducer(state: ProgramContent, action: DraftAction): ProgramContent {
  switch (action.type) {
    case 'cohort/add': {
      const last = state.cohorts.at(-1)
      const seats = last && Number.isInteger(last.totalSeats) && last.totalSeats > 0 ? last.totalSeats : 20
      const blank: Cohort = { id: action.id, name: '', startDate: '', endDate: '', format: last?.format ?? 'hybrid', seatsRemaining: seats, totalSeats: seats }
      return { ...state, cohorts: [...state.cohorts, blank] }
    }
    case 'cohort/text':
      return { ...state, cohorts: replaceAt(state.cohorts, action.index, (c) => setCohortText(c, action.field, action.value)) }
    case 'cohort/format':
      return { ...state, cohorts: replaceAt(state.cohorts, action.index, (c) => ({ ...c, format: action.value })) }
    case 'cohort/number':
      return { ...state, cohorts: replaceAt(state.cohorts, action.index, (c) => ({ ...c, [action.field]: action.value })) }
    case 'cohort/remove':
      return { ...state, cohorts: state.cohorts.filter((_, i) => i !== action.index) }
    case 'pricing/text':
      return { ...state, pricing: replaceAt(state.pricing, action.index, (p) => ({ ...p, [action.field]: action.value })) }
    case 'pricing/amount':
      return { ...state, pricing: replaceAt(state.pricing, action.index, (p) => ({ ...p, amount: action.value })) }
    case 'heroPriceLabel':
      return { ...state, heroPriceLabel: action.value }
    case 'image':
      return { ...state, landingImageUrl: action.url }
    case 'reset':
      return action.value
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/draft-reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `FieldError`, `CohortsTab` and `PricingTab`**

`src/components/editor/FieldError.tsx`:
```tsx
import type { Issue } from '@/lib/validate'

export function FieldError({ issues, path }: { issues: Issue[]; path: string }) {
  return (
    <>
      {issues
        .filter((i) => i.path === path)
        .map((i) => (
          <p key={i.message} className={`field-msg field-${i.level}`}>
            {i.message}
          </p>
        ))}
    </>
  )
}

export const isInvalid = (issues: Issue[], path: string) => issues.some((i) => i.path === path && i.level === 'error')
```

`src/components/editor/CohortsTab.tsx`:
```tsx
'use client'

import type { Dispatch } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { StatusPill } from '@/components/StatusPill'
import { NEW_COHORT_PREFIX } from '@/lib/cohort-ids'
import { getCohortStatus } from '@/lib/cohort-status'
import { COHORT_FORMATS, type Cohort, type CohortFormat } from '@/lib/content-schema'
import { isRealDate } from '@/lib/dates'
import type { DraftAction } from '@/lib/draft-reducer'
import type { Issue } from '@/lib/validate'
import { FieldError, isInvalid } from './FieldError'

const FORMAT_LABELS: Record<CohortFormat, string> = { hybrid: 'Hybrid', virtual: 'Virtual', 'in-person': 'In person' }
const shown = (n: number) => (Number.isNaN(n) ? '' : n)

interface Props {
  cohorts: Cohort[]
  issues: Issue[]
  now: Date
  dispatch: Dispatch<DraftAction>
}

export function CohortsTab({ cohorts, issues, now, dispatch }: Props) {
  return (
    <div className="stack">
      <p className="hint">
        Set <b>seats left</b> to 0 to close enrolment. Status updates as you type, using the same rules as the website.
      </p>
      <div className="table-wrap">
        <table className="ctable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start</th>
              <th>End</th>
              <th>Format</th>
              <th>Seats left</th>
              <th>Total</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, index) => {
              const at = (field: string) => `cohorts.${index}.${field}`
              const status = isRealDate(c.startDate) && isRealDate(c.endDate) ? getCohortStatus(c, now) : null
              return (
                <tr key={c.id} className={status === 'ended' ? 'is-past' : undefined}>
                  <td data-label="Name">
                    <input className="inp" aria-label="Cohort name" value={c.name} aria-invalid={isInvalid(issues, at('name'))}
                      onChange={(e) => dispatch({ type: 'cohort/text', index, field: 'name', value: e.target.value })} />
                    <FieldError issues={issues} path={at('name')} />
                  </td>
                  <td data-label="Start">
                    <input className="inp" type="date" aria-label="Start date" value={c.startDate} aria-invalid={isInvalid(issues, at('startDate'))}
                      onChange={(e) => dispatch({ type: 'cohort/text', index, field: 'startDate', value: e.target.value })} />
                    <FieldError issues={issues} path={at('startDate')} />
                  </td>
                  <td data-label="End">
                    <input className="inp" type="date" aria-label="End date" value={c.endDate} aria-invalid={isInvalid(issues, at('endDate'))}
                      onChange={(e) => dispatch({ type: 'cohort/text', index, field: 'endDate', value: e.target.value })} />
                    <FieldError issues={issues} path={at('endDate')} />
                  </td>
                  <td data-label="Format">
                    <select className="inp" aria-label="Format" value={c.format}
                      onChange={(e) => dispatch({ type: 'cohort/format', index, value: e.target.value as CohortFormat })}>
                      {COHORT_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {FORMAT_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Seats left">
                    <input className="inp inp-num" type="number" min={0} step={1} inputMode="numeric" aria-label="Seats left"
                      value={shown(c.seatsRemaining)} aria-invalid={isInvalid(issues, at('seatsRemaining'))}
                      onChange={(e) => dispatch({ type: 'cohort/number', index, field: 'seatsRemaining', value: e.target.valueAsNumber })} />
                    <FieldError issues={issues} path={at('seatsRemaining')} />
                  </td>
                  <td data-label="Total seats">
                    <input className="inp inp-num" type="number" min={1} step={1} inputMode="numeric" aria-label="Total seats"
                      value={shown(c.totalSeats)} aria-invalid={isInvalid(issues, at('totalSeats'))}
                      onChange={(e) => dispatch({ type: 'cohort/number', index, field: 'totalSeats', value: e.target.valueAsNumber })} />
                    <FieldError issues={issues} path={at('totalSeats')} />
                  </td>
                  <td data-label="Status">{status ? <StatusPill status={status} /> : <span className="meta">—</span>}</td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={`Remove ${c.name || 'cohort'}`}
                      onClick={() => dispatch({ type: 'cohort/remove', index })}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" className="btn btn-outline"
          onClick={() => dispatch({ type: 'cohort/add', id: `${NEW_COHORT_PREFIX}${crypto.randomUUID()}` })}>
          <Plus size={15} aria-hidden /> Add cohort
        </button>
      </div>
    </div>
  )
}
```

`src/components/editor/PricingTab.tsx`:
```tsx
'use client'

import type { Dispatch } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { ProgramContent } from '@/lib/content-schema'
import type { DraftAction } from '@/lib/draft-reducer'
import type { Issue } from '@/lib/validate'
import { FieldError, isInvalid } from './FieldError'

export function PricingTab({ draft, issues, dispatch }: { draft: ProgramContent; issues: Issue[]; dispatch: Dispatch<DraftAction> }) {
  return (
    <div className="stack">
      <p className="callout" role="note">
        <TriangleAlert size={17} aria-hidden />
        <span>
          Changing an amount here does <b>not</b> change the Paystack payment page. Update the matching Paystack page too, or
          learners will be charged the old price.
        </span>
      </p>
      <label className="field">
        <span>Hero price label</span>
        <small>Shown under the program title on its page.</small>
        <input className="inp" value={draft.heroPriceLabel} aria-invalid={isInvalid(issues, 'heroPriceLabel')}
          onChange={(e) => dispatch({ type: 'heroPriceLabel', value: e.target.value })} />
        <FieldError issues={issues} path="heroPriceLabel" />
      </label>
      <FieldError issues={issues} path="pricing" />
      {draft.pricing.map((option, index) => {
        const at = (field: string) => `pricing.${index}.${field}`
        return (
          <fieldset key={option.id} className="price-card">
            <legend>{option.title || option.id}</legend>
            <label className="field">
              <span>Title</span>
              <input className="inp" value={option.title} aria-invalid={isInvalid(issues, at('title'))}
                onChange={(e) => dispatch({ type: 'pricing/text', index, field: 'title', value: e.target.value })} />
              <FieldError issues={issues} path={at('title')} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Price label</span>
                <small>Exactly as shown, e.g. “2 × ₦87,500”</small>
                <input className="inp" value={option.priceLabel} aria-invalid={isInvalid(issues, at('priceLabel'))}
                  onChange={(e) => dispatch({ type: 'pricing/text', index, field: 'priceLabel', value: e.target.value })} />
                <FieldError issues={issues} path={at('priceLabel')} />
              </label>
              <label className="field">
                <span>Amount (₦)</span>
                <small>{option.id === 'full' ? 'Total fee. Also used to track installment balances.' : 'Amount per payment.'}</small>
                <input className="inp" type="number" min={1} step={1} inputMode="numeric"
                  value={Number.isNaN(option.amount) ? '' : option.amount} aria-invalid={isInvalid(issues, at('amount'))}
                  onChange={(e) => dispatch({ type: 'pricing/amount', index, value: e.target.valueAsNumber })} />
                <FieldError issues={issues} path={at('amount')} />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea className="inp" rows={2} value={option.description}
                onChange={(e) => dispatch({ type: 'pricing/text', index, field: 'description', value: e.target.value })} />
            </label>
          </fieldset>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Write `ImageTab`**

`src/components/editor/ImageTab.tsx`:
```tsx
'use client'

import { useState, type Dispatch } from 'react'
import { Upload } from 'lucide-react'
import type { DraftAction } from '@/lib/draft-reducer'

const MAX_BYTES = 4 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

export function ImageTab({ slug, url, dispatch }: { slug: string; url: string; dispatch: Dispatch<DraftAction> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function upload(file: File) {
    setError(null)
    // Quick checks here for instant feedback; the server re-checks everything by decoding the file.
    if (!ACCEPT.includes(file.type)) return setError("That file isn't a JPG, PNG or WebP image")
    if (file.size > MAX_BYTES) return setError('That image is over 4 MB. Please use a smaller file')
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`/api/images?slug=${encodeURIComponent(slug)}`, { method: 'POST', body })
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !data?.url) throw new Error(data?.error ?? 'Upload failed. Your session may have ended. Reload the page and try again')
      dispatch({ type: 'image', url: data.url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {/* eslint-disable-next-line @next/next/no-img-element -- Blob/data URLs, already optimised */}
      <img className="image-preview" src={url} alt="Current landing image" />
      <label
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) void upload(file)
        }}
      >
        <Upload size={22} aria-hidden />
        <b>{busy ? 'Uploading…' : 'Drop a new image here, or click to choose'}</b>
        <small>JPG, PNG or WebP · up to 4 MB · at least 800×450 · optimised automatically</small>
        <input type="file" accept={ACCEPT.join(',')} className="sr-only" disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }} />
      </label>
      {error && (
        <p className="field-msg field-error" role="alert">
          {error}
        </p>
      )}
      <p className="meta">Appears on this program’s card on the homepage. The new image goes live only when you publish.</p>
    </div>
  )
}
```

- [ ] **Step 7: Write `ProgramEditor` (review panel placeholder until Task 14) and the page**

`src/components/editor/ProgramEditor.tsx`:
```tsx
'use client'

import { useEffect, useMemo, useReducer, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ProgramContent } from '@/lib/content-schema'
import { describeChanges } from '@/lib/diff'
import { draftReducer } from '@/lib/draft-reducer'
import { liveUrl, type ProgramInfo } from '@/lib/programs'
import { validateProgram, type Issue } from '@/lib/validate'
import { CohortsTab } from './CohortsTab'
import { ImageTab } from './ImageTab'
import { PricingTab } from './PricingTab'

type Tab = 'cohorts' | 'pricing' | 'image'
const TABS: { id: Tab; label: string; owns: (path: string) => boolean }[] = [
  { id: 'cohorts', label: 'Cohorts', owns: (p) => p.startsWith('cohorts') },
  { id: 'pricing', label: 'Pricing', owns: (p) => p.startsWith('pricing') || p === 'heroPriceLabel' },
  { id: 'image', label: 'Landing image', owns: (p) => p === 'landingImageUrl' },
]

export interface ProgramEditorProps {
  info: ProgramInfo
  initial: ProgramContent
  baseVersion: number
  nowIso: string
  publishedVersion: number | null
  feedWarning: boolean
}

export function ProgramEditor({ info, initial, baseVersion, nowIso, publishedVersion, feedWarning }: ProgramEditorProps) {
  const [draft, dispatch] = useReducer(draftReducer, initial)
  const [tab, setTab] = useState<Tab>('cohorts')
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const issues: Issue[] = useMemo(() => validateProgram(draft, { now, original: initial }), [draft, initial, now])
  const changes = useMemo(() => describeChanges(initial, draft, now), [initial, draft, now])

  // Warn before closing the tab with unpublished edits.
  useEffect(() => {
    if (changes.length === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changes.length])

  return (
    <div className="panes">
      <section className="pane-main">
        <Link className="back" href={`/?p=${info.slug}`}>
          <ArrowLeft size={14} aria-hidden /> All programs
        </Link>
        {publishedVersion !== null && (
          <p className="banner banner-ok" role="status">
            Published version {publishedVersion}. The live site updates within about a minute.{' '}
            <a href={liveUrl(info)} target="_blank" rel="noreferrer">
              View live page ↗
            </a>
          </p>
        )}
        {feedWarning && (
          <p className="banner banner-warn" role="alert">
            Published, but the win-back cohort feed didn’t update. Publish again, or tell a developer.
          </p>
        )}
        <header className="phead">
          <h1>{info.name}</h1>
          <span className="meta">Editing version {baseVersion}</span>
        </header>
        <div className="card">
          <div className="tabs" role="tablist" aria-label="Edit sections">
            {TABS.map((t) => {
              const errors = issues.filter((i) => i.level === 'error' && t.owns(i.path)).length
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                  {errors > 0 && <span className="tab-count">{errors}</span>}
                </button>
              )
            })}
          </div>
          <div className="tabpad" role="tabpanel">
            {tab === 'cohorts' && <CohortsTab cohorts={draft.cohorts} issues={issues} now={now} dispatch={dispatch} />}
            {tab === 'pricing' && <PricingTab draft={draft} issues={issues} dispatch={dispatch} />}
            {tab === 'image' && <ImageTab slug={info.slug} url={draft.landingImageUrl} dispatch={dispatch} />}
          </div>
        </div>
      </section>
      {/* Replaced by <ReviewPanel> in Task 14. */}
      <aside className="pane-detail" aria-label="Review changes">
        <h2 className="detail-title">Review changes</h2>
        <ul className="changes">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
```

`src/app/(console)/programs/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { NotSeeded } from '@/components/NotSeeded'
import { ProgramEditor } from '@/components/editor/ProgramEditor'
import { getProgram } from '@/lib/programs'
import { readContentOrNull } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function EditProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ published?: string; feed?: string }>
}) {
  const [{ slug }, { published, feed }] = await Promise.all([params, searchParams])
  const info = getProgram(slug)
  if (!info) notFound()
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const entry = loaded.content.programs[info.slug]
  if (!entry) notFound()

  return (
    <ProgramEditor
      // Remount with fresh state whenever a new version is live.
      key={loaded.content.version}
      info={info}
      initial={entry}
      baseVersion={loaded.content.version}
      nowIso={new Date().toISOString()}
      publishedVersion={published ? Number(published) : null}
      feedWarning={feed === '0'}
    />
  )
}
```

- [ ] **Step 8: Append editor styles to `src/app/globals.css`**

```css
/* editor */
.back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--muted); font-size: 12.5px; font-weight: 500; text-decoration: none; }
.back:hover { color: var(--fg); }
.card { background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.tabs { display: flex; gap: 4px; padding: 7px 8px; background: var(--panel-2); border-bottom: 1px solid var(--hair); overflow-x: auto; }
.tabs button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; color: var(--muted); font-weight: 600; font-size: 13px; padding: 8px 13px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
.tabs button[aria-selected='true'] { background: var(--panel); color: var(--green-deep); box-shadow: var(--shadow-sm); }
.tab-count { min-width: 18px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 11px; line-height: 18px; text-align: center; }
.tabpad { padding: 16px; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.hint { font-size: 12.5px; color: var(--muted); }
.table-wrap { overflow-x: auto; }
.ctable { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.ctable th { text-align: left; padding: 0 8px 10px; font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); font-weight: 600; white-space: nowrap; }
.ctable td { padding: 8px; border-top: 1px solid var(--hair); vertical-align: top; }
.ctable tr.is-past td { opacity: .62; }
.inp { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); font-size: 13px; font-variant-numeric: tabular-nums; }
.inp:focus { outline: none; border-color: var(--green); box-shadow: var(--ring); }
.inp[aria-invalid='true'] { border-color: var(--danger); }
.inp-num { max-width: 84px; }
.icon-btn { border: 0; background: none; color: var(--faint); padding: 7px; border-radius: 8px; cursor: pointer; display: inline-grid; place-items: center; }
.icon-btn:hover { color: var(--danger); background: var(--danger-bg); }
.field-msg { margin-top: 4px; font-size: 11.5px; }
.field-error { color: var(--danger); }
.field-warning { color: var(--full-fg); }
.field { display: flex; flex-direction: column; gap: 4px; }
.field > span { font-size: 12.5px; font-weight: 600; }
.field small { font-size: 11.5px; color: var(--faint); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.price-card { border: 1px solid var(--border-soft); border-radius: 12px; padding: 14px; margin: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.price-card legend { padding: 0 6px; font-weight: 600; font-size: 13px; }
.callout { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; font-size: 13px; background: var(--full-bg); color: var(--full-fg); }
.callout svg { flex: none; margin-top: 2px; }
.image-preview { width: 100%; max-width: 560px; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 14px; background: var(--raise); }
.dropzone {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 26px 16px; max-width: 560px; text-align: center;
  border: 1.5px dashed var(--border); border-radius: 14px; background: var(--panel-2); color: var(--muted); cursor: pointer;
}
.dropzone:hover, .dropzone.is-dragging { border-color: var(--green); background: var(--open-bg); color: var(--green-deep); }
.dropzone:focus-within { box-shadow: var(--ring); }
@media (max-width: 760px) {
  .ctable thead { display: none; }
  .ctable, .ctable tbody, .ctable tr, .ctable td { display: block; }
  .ctable tr { border: 1px solid var(--border-soft); border-radius: 12px; padding: 6px; margin-bottom: 10px; }
  .ctable td { border-top: 0; padding: 6px; }
  .ctable td[data-label]::before { content: attr(data-label); display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--faint); font-weight: 600; margin-bottom: 3px; }
  .inp-num { max-width: none; }
  .field-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 9: Verify in demo mode**

Run: `npm run typecheck && npm test && npm run build`, then `npm run dev` (demo mode from Task 12).
With Playwright: open `/programs/school-of-finance`; change the 23 Jan 2027 cohort's seats to `0` (pill turns Full and the review list shows the change); clear "Seats left" (red field error, Cohorts tab shows a count); add a cohort and pick `2027-04-10` (name becomes "Q2 2027 Cohort"); open Pricing (Paystack warning visible); screenshot at 1440×900 and 390×844.
Expected: all of the above, no console errors. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add -A src tests/draft-reducer.test.ts
git commit -m "$(cat <<'EOF'
feat: program editor with cohorts, pricing and image tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Review & publish, and the image upload endpoint

**Files:**
- Create: `src/components/editor/ReviewPanel.tsx`, `src/app/api/images/route.ts`
- Modify: `src/app/actions.ts` (add `publishProgramAction`), `src/components/editor/ProgramEditor.tsx` (use `ReviewPanel`), `src/app/globals.css` (append review styles)

**Interfaces:**
- Consumes: `publishProgram`, `PublishResult` (Task 8); `requireAdmin`, `UnauthorizedError`, `getStore` (Task 11); `processLandingImage`, `imagePathname`, `MAX_UPLOAD_BYTES` (Task 9); `isProgramSlug` (Task 2); `describeChanges` (Task 5); `issueLabel`, `Issue` (Task 4).
- Produces: `publishProgramAction(slug: string, draft: ProgramContent, baseVersion: number): Promise<PublishResult | { ok: false; reason: 'unauthorized' }>`; `POST /api/images?slug=<slug>` (multipart field `file`) → `200 { url }` | `4xx { error }`; `<ReviewPanel info original draft issues changes baseVersion onDiscard />`.

- [ ] **Step 1: Add the publish server action**

Replace `src/app/actions.ts` with:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { signOut } from '@/auth'
import type { ProgramContent } from '@/lib/content-schema'
import { publishProgram, type PublishResult } from '@/lib/publish'
import { requireAdmin, UnauthorizedError } from '@/lib/session'
import { getStore } from '@/lib/store-instance'

export type Unauthorized = { ok: false; reason: 'unauthorized' }

/** Every write re-checks the session server-side; the client is never trusted. */
async function adminOrNull(): Promise<string | null> {
  try {
    return await requireAdmin()
  } catch (error) {
    if (error instanceof UnauthorizedError) return null
    throw error
  }
}

export async function publishProgramAction(slug: string, draft: ProgramContent, baseVersion: number): Promise<PublishResult | Unauthorized> {
  const by = await adminOrNull()
  if (!by) return { ok: false, reason: 'unauthorized' }
  const result = await publishProgram(await getStore(), { slug, draft, baseVersion, by })
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
```

- [ ] **Step 2: Add the image upload route**

`src/app/api/images/route.ts`:
```ts
import { MAX_UPLOAD_BYTES, imagePathname, processLandingImage } from '@/lib/image'
import { isProgramSlug } from '@/lib/programs'
import { requireAdmin } from '@/lib/session'
import { getStore } from '@/lib/store-instance'

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch {
    return Response.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 })
  }

  const slug = new URL(request.url).searchParams.get('slug') ?? ''
  if (!isProgramSlug(slug)) return Response.json({ error: 'Unknown program.' }, { status: 400 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'No file was received. Try again.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'That image is over 4 MB. Please use a smaller file' }, { status: 413 })

  const result = await processLandingImage(Buffer.from(await file.arrayBuffer()))
  if (!result.ok) return Response.json({ error: result.message }, { status: 422 })

  const url = await (await getStore()).putImage(imagePathname(slug, result.hash), result.body, result.contentType)
  return Response.json({ url })
}
```

- [ ] **Step 3: Write `ReviewPanel`**

`src/components/editor/ReviewPanel.tsx`:
```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { publishProgramAction } from '@/app/actions'
import type { ProgramContent } from '@/lib/content-schema'
import type { ProgramInfo } from '@/lib/programs'
import { issueLabel, type Issue } from '@/lib/validate'

type Problem = { kind: 'conflict' } | { kind: 'unauthorized' } | { kind: 'error'; message: string }

interface Props {
  info: ProgramInfo
  draft: ProgramContent
  issues: Issue[]
  changes: string[]
  baseVersion: number
  onDiscard: () => void
}

export function ReviewPanel({ info, draft, issues, changes, baseVersion, onDiscard }: Props) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [serverIssues, setServerIssues] = useState<Issue[]>([])

  const errors = [...issues.filter((i) => i.level === 'error'), ...serverIssues]
  const warnings = issues.filter((i) => i.level === 'warning')
  const canPublish = changes.length > 0 && errors.length === 0 && !pending

  function publish() {
    startTransition(async () => {
      try {
        const result = await publishProgramAction(info.slug, draft, baseVersion)
        dialogRef.current?.close()
        if (result.ok) {
          router.replace(`/programs/${info.slug}?published=${result.version}${result.feedUpdated ? '' : '&feed=0'}`)
          return
        }
        if (result.reason === 'invalid') setServerIssues(result.issues)
        else if (result.reason === 'conflict') setProblem({ kind: 'conflict' })
        else if (result.reason === 'unauthorized') setProblem({ kind: 'unauthorized' })
        else setProblem({ kind: 'error', message: 'This program could not be found.' })
      } catch {
        dialogRef.current?.close()
        setProblem({ kind: 'error', message: 'Publishing failed. Check your connection and try again.' })
      }
    })
  }

  return (
    <aside className="pane-detail" aria-label="Review changes">
      <div className="review-head">
        <h2 className="detail-title">Review changes</h2>
        {changes.length > 0 && <span className="chip-draft">{changes.length} unpublished</span>}
      </div>

      {problem?.kind === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          This program was updated in another session since you opened it. Reload to see the latest version. Your unsaved
          edits here will be lost.
          <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
      {problem?.kind === 'unauthorized' && (
        <div className="banner banner-warn" role="alert">
          Your session has ended. Copy any edits you need, then <a href="/login">sign in again</a>.
        </div>
      )}
      {problem?.kind === 'error' && (
        <div className="banner banner-error" role="alert">
          {problem.message}
        </div>
      )}

      {changes.length === 0 ? (
        <p className="empty-note">No changes yet. Edits you make appear here before anything goes live.</p>
      ) : (
        <ul className="changes">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div className="issues issues-error" role="alert">
          <b>Fix before publishing</b>
          <ul>
            {errors.map((i) => (
              <li key={`${i.path}:${i.message}`}>{issueLabel(i, draft)}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="issues issues-warn">
          <b>Check</b>
          <ul>
            {warnings.map((i) => (
              <li key={`${i.path}:${i.message}`}>{issueLabel(i, draft)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn btn-danger" disabled={changes.length === 0 || pending}
          onClick={() => { onDiscard(); setServerIssues([]); setProblem(null) }}>
          Discard
        </button>
        <button type="button" className="btn btn-primary" disabled={!canPublish} onClick={() => dialogRef.current?.showModal()}>
          Review &amp; publish
        </button>
      </div>

      <dialog ref={dialogRef} className="confirm" aria-labelledby="confirm-title">
        <h2 id="confirm-title">
          Publish {changes.length} change{changes.length === 1 ? '' : 's'} to the live site?
        </h2>
        <ul className="changes">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="meta">The public site updates within about a minute. You can roll back from Publish history.</p>
        <div className="actions">
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={publish}>
            {pending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </dialog>
    </aside>
  )
}
```

- [ ] **Step 4: Use `ReviewPanel` in `ProgramEditor`**

In `src/components/editor/ProgramEditor.tsx`, add the import:
```tsx
import { ReviewPanel } from './ReviewPanel'
```
and replace the placeholder `<aside>…</aside>` block (from the `{/* Replaced by <ReviewPanel> in Task 14. */}` comment through its closing `</aside>`) with:
```tsx
      <ReviewPanel
        info={info}
        draft={draft}
        issues={issues}
        changes={changes}
        baseVersion={baseVersion}
        onDiscard={() => dispatch({ type: 'reset', value: initial })}
      />
```

- [ ] **Step 5: Append review styles to `src/app/globals.css`**

```css
/* review + confirm */
.review-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.changes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.issues { border-radius: 12px; padding: 12px 14px; font-size: 12.5px; }
.issues ul { margin: 6px 0 0; padding-left: 18px; }
.issues-error { background: var(--danger-bg); color: var(--danger); }
.issues-warn { background: var(--full-bg); color: var(--full-fg); }
.empty-note { font-size: 13px; color: var(--muted); padding: 14px; border: 1px dashed var(--border); border-radius: 12px; }
dialog.confirm { width: min(520px, calc(100vw - 32px)); border: 1px solid var(--border-soft); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); background: var(--panel); color: var(--fg); }
dialog.confirm::backdrop { background: rgba(19, 35, 42, .35); }
dialog.confirm h2 { font-size: 17px; margin-bottom: 12px; }
dialog.confirm .meta { margin-top: 12px; }
dialog.confirm .actions { margin-top: 18px; }
```

- [ ] **Step 6: Verify the publish loop in demo mode**

Run: `npm run typecheck && npm test && npm run build`, then `npm run dev` (demo mode).
With Playwright on `/programs/data-school`:
1. Change "Q3 2026 Cohort" seats left 24 → 20. Review lists "Q3 2026 Cohort: seats left 24 → 20". Click **Review & publish**, then **Publish**. The green banner shows "Published version 2", the sidebar shows "v2 Published", and the review panel is empty again.
2. Image tab: upload a ≥800×450 JPG. Preview swaps, review shows "Landing image replaced". Upload a 600×400 PNG and get the "at least 800×450" error.
3. Two tabs on the same program: publish from tab A, then try publishing a different edit from tab B. Tab B shows the "updated in another session" banner.
4. `curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/images?slug=nope"` with `ADMIN_DEMO` unset (restart dev without it) → `302`/`401`, never `200`.
Expected: as described, no console errors. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat: review-and-publish flow with conflict handling and image uploads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Publish history and one-click rollback

**Files:**
- Create: `src/app/(console)/history/page.tsx`, `src/components/RollbackButton.tsx`
- Modify: `src/app/actions.ts` (add `rollbackAction`), `src/app/globals.css` (append history styles)

**Interfaces:**
- Consumes: `rollbackLastPublish`, `RollbackResult` (Task 8); `adminOrNull` pattern and `Unauthorized` (Task 14); `getStore`, `readContentOrNull` (Task 11); `formatStamp` (Task 3); `NotSeeded`, `StatusPill` (Task 12).
- Produces: `rollbackAction(baseVersion: number): Promise<RollbackResult | Unauthorized>`; `/history` page.

- [ ] **Step 1: Add the rollback action**

In `src/app/actions.ts`, extend the publish import line to:
```ts
import { publishProgram, rollbackLastPublish, type PublishResult, type RollbackResult } from '@/lib/publish'
```
and add below `publishProgramAction`:
```ts
export async function rollbackAction(baseVersion: number): Promise<RollbackResult | Unauthorized> {
  const by = await adminOrNull()
  if (!by) return { ok: false, reason: 'unauthorized' }
  const result = await rollbackLastPublish(await getStore(), { baseVersion, by })
  if (result.ok) revalidatePath('/', 'layout')
  return result
}
```

- [ ] **Step 2: Write `RollbackButton`**

`src/components/RollbackButton.tsx`:
```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { rollbackAction } from '@/app/actions'

export function RollbackButton({ baseVersion, previousVersion }: { baseVersion: number; previousVersion: number | null }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  function rollBack() {
    startTransition(async () => {
      const result = await rollbackAction(baseVersion)
      dialogRef.current?.close()
      if (result.ok) {
        setMessage({ tone: 'ok', text: `Rolled back. Version ${result.restoredFrom}'s content is live again as version ${result.version}.` })
        router.refresh()
      } else if (result.reason === 'conflict') {
        setMessage({ tone: 'warn', text: 'Someone published since this page loaded. Reload and try again.' })
      } else if (result.reason === 'no-backup') {
        setMessage({ tone: 'warn', text: 'There is no earlier version to roll back to.' })
      } else {
        setMessage({ tone: 'warn', text: 'Your session has ended. Sign in again.' })
      }
    })
  }

  return (
    <>
      {message && (
        <p className={`banner banner-${message.tone}`} role="status">
          {message.text}
        </p>
      )}
      <p className="history-actions">
        <button type="button" className="btn btn-danger" disabled={previousVersion === null || pending} onClick={() => dialogRef.current?.showModal()}>
          <RotateCcw size={15} aria-hidden /> Roll back last publish
        </button>
      </p>
      <dialog ref={dialogRef} className="confirm" aria-labelledby="rollback-title">
        <h2 id="rollback-title">Roll back to version {previousVersion}?</h2>
        <p className="psub">
          This restores dates, prices and images from before the last publish, for every program. It goes live as version {baseVersion + 1}.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-outline" disabled={pending} onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={rollBack}>
            {pending ? 'Rolling back…' : 'Roll back'}
          </button>
        </div>
      </dialog>
    </>
  )
}
```

- [ ] **Step 3: Write the history page**

`src/app/(console)/history/page.tsx`:
```tsx
import { NotSeeded } from '@/components/NotSeeded'
import { RollbackButton } from '@/components/RollbackButton'
import { formatStamp } from '@/lib/format'
import { getStore, readContentOrNull } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const loaded = await readContentOrNull()
  if (!loaded) return <NotSeeded />
  const { content } = loaded
  const backups = await (await getStore()).listBackups()
  const previous = backups.find((b) => b.version < content.version) ?? null
  const by = content.updatedBy === 'seed' ? 'Imported from the website' : content.updatedBy

  return (
    <div className="panes panes-single">
      <section className="pane-main">
        <header className="phead">
          <h1>Publish history</h1>
          <span className="meta">Live: version {content.version}</span>
        </header>
        <p className="psub">
          Every publish saves the previous version first. Rolling back restores the version from before the last publish, as a
          new version, so you can always roll forward again.
        </p>
        <RollbackButton baseVersion={content.version} previousVersion={previous?.version ?? null} />
        <ul className="list">
          <li className="hist-row">
            <span>
              <b>Version {content.version}</b>
              <span className="meta"> · {by} · {formatStamp(content.updatedAt)}</span>
            </span>
            <span className="pill pill-open">Live</span>
          </li>
          {backups.map((b) => (
            <li key={b.pathname} className="hist-row">
              <span>
                <b>Version {b.version}</b>
                <span className="meta"> · replaced {formatStamp(b.savedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
        {backups.length === 0 && <p className="meta history-empty">Publish a change to see history build up here.</p>}
      </section>
    </div>
  )
}
```

Append to `src/app/globals.css`:
```css
/* history */
.history-actions { margin-bottom: 18px; }
.hist-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--panel); border: 1px solid var(--border-soft); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
.hist-row b { font-weight: 600; }
.history-empty { margin-top: 12px; }
```

- [ ] **Step 4: Verify in demo mode**

Run: `npm run typecheck && npm test && npm run build`, then `npm run dev` (demo mode).
With Playwright: publish a seat change on any program (version 2), open **Publish history**, click **Roll back last publish**, then **Roll back**. The banner says "Version 1's content is live again as version 3", the program shows its original seats, and the list shows v3 Live, v2, v1.
Expected: as described. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "$(cat <<'EOF'
feat: publish history page with one-click rollback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: XSS hardening — Content Security Policy, security headers, guard tests

**What XSS is (for the record):** cross-site scripting means getting a browser to run someone else's JavaScript *inside our site*. In the portal that script would act as the signed-in admin and could publish anything. Typical routes in: text that gets inserted into the page as HTML, a link or image URL like `javascript:…`, or an uploaded "image" that is really an SVG/HTML file.

**Defences already in earlier tasks:** React escapes all text it renders; no HTML is ever stored or rendered from content; image URLs must be our Blob store (`isSafeImageUrl`, Task 4); uploads are decoded and re-encoded to WebP with SVG/GIF/HTML rejected (Task 9); images are served from the Blob domain, a different origin; session cookies are `httpOnly`, so script can't read them; every write re-checks the session server-side (Tasks 11, 14). **This task adds** a strict nonce-based Content Security Policy (the browser refuses to run any script we didn't issue) plus standard security headers, and tests that stop risky patterns from creeping in.

**Files:**
- Create: `src/lib/csp.ts`, `tests/csp.test.ts`, `tests/xss-guards.test.ts`
- Modify: `src/proxy.ts` (nonce + CSP on every page, including `/login`), `next.config.ts` (static security headers)

**Interfaces:**
- Consumes: `auth` (Task 11), `isAllowedEmail`, `parseAllowlist`, `isDemoMode` (Task 11).
- Produces: `buildCsp(nonce: string, opts: { dev: boolean }): string`, `createNonce(): string`, `SECURITY_HEADERS: { key: string; value: string }[]`.

- [ ] **Step 1: Write the failing tests**

`tests/csp.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { SECURITY_HEADERS, buildCsp, createNonce } from '@/lib/csp'

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

describe('buildCsp', () => {
  const csp = buildCsp('abc123', { dev: false })

  it('only runs scripts carrying this response’s nonce', () => {
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
  })
  it('never allows inline or eval’d script in production', () => {
    expect(directive(csp, 'script-src')).not.toMatch(/unsafe-inline|unsafe-eval/)
  })
  it('allows eval only in local development (Next.js dev tooling needs it)', () => {
    expect(directive(buildCsp('n', { dev: true }), 'script-src')).toContain("'unsafe-eval'")
  })
  it('blocks framing, plugins and base-tag hijacks', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })
  it('loads images only from us and the Blob store', () => {
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob: https://*.public.blob.vercel-storage.com")
  })
  it('lets the sign-in form hand off to Google and nowhere else', () => {
    expect(directive(csp, 'form-action')).toBe("form-action 'self' https://accounts.google.com")
  })
})

describe('createNonce', () => {
  it('is unique per call and base64', () => {
    const a = createNonce()
    expect(a).not.toBe(createNonce())
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })
})

describe('SECURITY_HEADERS', () => {
  it('sets the standard hardening headers', () => {
    const keys = SECURITY_HEADERS.map((h) => h.key)
    expect(keys).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Strict-Transport-Security']),
    )
  })
})
```

`tests/xss-guards.test.ts`:
```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => ({ path: f, text: readFileSync(join(SRC, f), 'utf8') }))

describe('XSS guard rails across src/', () => {
  it.each([
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML / outerHTML writes', /\.(inner|outer)HTML\s*=/],
    ['eval / new Function', /\beval\(|new Function\(/],
    ['document.write', /document\.write/],
  ])('never uses %s', (_name, pattern) => {
    expect(files.filter((f) => pattern.test(f.text)).map((f) => f.path)).toEqual([])
  })

  it('opens external links with rel="noreferrer"', () => {
    const offenders = files.filter((f) => /target="_blank"(?![^>]*rel="noreferrer")/.test(f.text)).map((f) => f.path)
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/csp.test.ts tests/xss-guards.test.ts`
Expected: `csp.test.ts` FAILS (unresolved import). `xss-guards.test.ts` should already PASS. If it doesn't, fix the offending file before continuing.

- [ ] **Step 3: Implement `csp.ts`**

`src/lib/csp.ts`:
```ts
/**
 * Content Security Policy: the browser runs only scripts that carry this
 * response's random nonce, so injected <script> tags or inline handlers are inert.
 * Styles allow 'unsafe-inline' because React style props and next/font need it;
 * CSS cannot execute script.
 */
export function buildCsp(nonce: string, { dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
  ].join('; ')
}

export function createNonce(): string {
  return btoa(crypto.randomUUID())
}

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]
```

- [ ] **Step 4: Send the CSP from the proxy (now also on `/login`) and static headers from Next config**

Replace `src/proxy.ts` with:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { isAllowedEmail, parseAllowlist } from '@/lib/allowlist'
import { buildCsp, createNonce } from '@/lib/csp'
import { isDemoMode } from '@/lib/demo'

/** Next.js reads the nonce from the request's CSP header and stamps it on its own scripts. */
function withCsp(req: NextRequest) {
  const nonce = createNonce()
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== 'production' })
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

// Every page and API route except sign-in itself requires the allowlisted session.
// Pages and server actions re-check with requireAdmin(); this is the first gate, not the only one.
export const proxy = auth((req) => {
  const isLogin = req.nextUrl.pathname === '/login'
  if (!isLogin && !isDemoMode() && !isAllowedEmail(req.auth?.user?.email, parseAllowlist(process.env.ALLOWED_EMAILS))) {
    return Response.redirect(new URL('/login', req.nextUrl.origin))
  }
  return withCsp(req)
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
```

Replace `next.config.ts` with:
```ts
import type { NextConfig } from 'next'
import { SECURITY_HEADERS } from './src/lib/csp'

const config: NextConfig = {
  // sharp is a native module; keep it out of the server bundle.
  serverExternalPackages: ['sharp'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default config
```

- [ ] **Step 5: Run the tests and verify headers on a production build**

Run: `npx vitest run tests/csp.test.ts tests/xss-guards.test.ts && npm run typecheck && npm test`
Expected: PASS.

Then (demo mode is impossible in production, so this checks the signed-out path):
```bash
npm run build && npm run start   # background
curl -sI http://localhost:3000/login | grep -iE "content-security-policy|x-frame-options|x-content-type-options|strict-transport"
curl -s http://localhost:3000/login | grep -o 'nonce="[^"]*"' | head -3
```
Expected: the CSP header with a `'nonce-…'` value, `X-Frame-Options: DENY`, `nosniff`, HSTS. The page's `<script>` tags carry the same nonce. Stop the server.

Then `npm run dev` in demo mode and run the full editor flow (open editor, edit, upload image, publish, roll back) with Playwright, checking `browser_console_messages`.
Expected: **no** "Refused to execute/load … Content Security Policy" errors. If one appears, loosen only the exact directive it names and record why in `csp.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/csp.ts src/proxy.ts next.config.ts tests/csp.test.ts tests/xss-guards.test.ts
git commit -m "$(cat <<'EOF'
feat(security): nonce-based CSP, security headers and XSS guard tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: End-to-end check against real Google sign-in and a dev Blob store

**Prerequisites from the user (ask, do not guess):**
1. A Google OAuth client (Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application) with authorised redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://admin.edubridgeacademy.com/api/auth/callback/google`. The user pastes `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` into `.env.local` themselves.
2. A **dev** Vercel Blob store and its `BLOB_READ_WRITE_TOKEN` in `.env.local`. Creating it on Vercel is outward-facing: confirm with the user first.

**Files:**
- Modify: `README.md` (add "Local development" and "Seeding" sections, tick finished to-dos)

- [ ] **Step 1: Switch off demo mode**

Remove (or comment out) `ADMIN_DEMO` and `DEMO_PUBLIC_REPO` in `.env.local`. Confirm `.env.local` holds `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS=hello@edubridgeacademy.com`, `BLOB_READ_WRITE_TOKEN` (dev store). Run `git status` and confirm `.env.local` is not listed.

- [ ] **Step 2: Seed the dev store and run the parity check**

```bash
npm run seed -- --public-repo "/c/Users/okoro/Documents/EA Website Revamp/ea-website-revamp"
npm run parity -- --public-repo "/c/Users/okoro/Documents/EA Website Revamp/ea-website-revamp"
```
Expected: "Seeded content.json v1 with 6 programs, plus cohorts-feed.json" then "Parity check passed". Running the seed a second time fails with an "already exists" error, which is the intended protection.

- [ ] **Step 3: Manual E2E (spec §8), with the user signing in**

Run `npm run dev`. The user signs in with `hello@edubridgeacademy.com` in their browser. Then, together:
1. Sign in with any *other* Google account → "Not authorized" on `/login`.
2. Change a seat count and publish. Within 60 s, `curl -s "<blob-base>/content.json" | grep '"version"'` shows the new version, and `<blob-base>/cohorts-feed.json` reflects any date change.
3. Reopen the editor right after publishing. It shows "Editing version N+1" (confirms fresh reads bypass the CDN; if not, switch `blob-store.ts` to the documented fallback and re-test).
4. Upload a new image. It appears from a `*.public.blob.vercel-storage.com/images/<slug>-<hash>.webp` URL.
5. Run the conflict check with two tabs (as in Task 14) against the real store; Blob `ifMatch` must reject the second write.
6. Roll back from Publish history.
7. Use Chrome devtools device mode at 390 px: no horizontal scroll on dashboard, editor or history.

Record the results (pass/fail per item) in the task notes. Any failure goes back to the owning task.

- [ ] **Step 4: Update the README**

Add to `README.md` under "Start here":
```markdown
## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (see comments there). Use a **dev** Blob store locally.
3. First time only: `npm run seed -- --public-repo "<path to ea-website-revamp>"`, then `npm run parity -- --public-repo "<same path>"`.
4. `npm run dev` → http://localhost:3000

**Demo mode (no Google/Blob needed):** set `ADMIN_DEMO=1` and `DEMO_PUBLIC_REPO=<path to ea-website-revamp>` in `.env.local`.
The UI runs against an in-memory copy of today's site data. Production builds ignore these settings.

**Tests:** `npm test` · **Types:** `npm run typecheck`
```
Tick the to-dos that are done: "Plan the build", "Scaffold…", "Seed content.json…", "Build dashboard + program editor…".

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: local development, demo mode and seeding instructions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Go live on admin.edubridgeacademy.com (each step needs the user's explicit OK)

Everything in this task is outward-facing. Before each numbered step, tell the user exactly what will happen and wait for a yes.

- [ ] **Step 1: Confirm cost**

Tell the user: a second Vercel project + Blob store fits the free/Hobby tier at this volume (a handful of writes per week, small JSON reads). If the team plan requires Vercel Pro for a second project or custom domain, say so and stop until they decide. No silent bills.

- [ ] **Step 2: Create the GitHub repo and push** *(after OK)*

```bash
gh repo create edubridge-admin-portal --private --source . --remote origin
git push -u origin main
```

- [ ] **Step 3: Create the Vercel project and production Blob store** *(after OK)*

```bash
vercel link            # create new project "edubridge-admin-portal"; do NOT link the public site's project
vercel blob --help     # confirm the store-create subcommand for this CLI version (58.x), then create store "edubridge-content" and connect it to this project
```
Expected: the project has `BLOB_READ_WRITE_TOKEN` in Production.

- [ ] **Step 4: Set production env vars** *(after OK)*

```bash
vercel env add AUTH_SECRET production          # value from: npx auth secret --raw
vercel env add AUTH_GOOGLE_ID production
vercel env add AUTH_GOOGLE_SECRET production
vercel env add ALLOWED_EMAILS production       # hello@edubridgeacademy.com
```
The user pastes the secrets into the prompts. Never echo secrets into the transcript. Do **not** set `ADMIN_DEMO`.

- [ ] **Step 5: Seed the production store** *(after OK)*

Pull production env to a temporary file, then seed and check parity against it:
```bash
vercel env pull .env.production.local --environment=production
npx tsx --env-file=.env.production.local scripts/seed.ts --public-repo "/c/Users/okoro/Documents/EA Website Revamp/ea-website-revamp"
npx tsx --env-file=.env.production.local scripts/parity.ts --public-repo "/c/Users/okoro/Documents/EA Website Revamp/ea-website-revamp"
rm .env.production.local
```
Expected: seed + "Parity check passed".

- [ ] **Step 6: Deploy, add the domain, verify** *(after OK)*

```bash
vercel deploy --prod
vercel domains add admin.edubridgeacademy.com
```
The user adds the DNS record Vercel prints (CNAME `admin` → `cname.vercel-dns.com`) at their DNS provider. Then:
- `https://admin.edubridgeacademy.com/` redirects to `/login`.
- Sign-in with `hello@` works; any other account is refused.
- The dashboard shows version 1 "Imported from the website".
- Make **no** content edits yet. The public site doesn't read the store until Plan 2 ships.

- [ ] **Step 7: Record the outcome**

Update `README.md`: status line → "Phase 1 live at admin.edubridgeacademy.com; public overlay (Plan 2) and win-back repoint (Plan 3) next", and tick "Set up the new GitHub repo + Vercel project". Commit and push (after OK).

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: record Phase 1 go-live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Self-review notes

- **Spec coverage:** §1 scope → Tasks 2, 13 (cohorts add/edit/remove, seats 0 = close, pricing, image), 11 (login), 6/8 (feed). §2 architecture → Tasks 7, 8, 14. §3 model/overlay/validation/seeding → Tasks 2, 4, 9, 10 (the overlay itself is Plan 2). §4 screens → Tasks 11, 12, 13, 14 (diff, confirm, toast/banner, conflict guard). §5 auth/security → Tasks 11, 14 (server re-checks), 9 (image safety), 16 (CSP + headers + XSS guards), 4 (safe image URLs, length caps), 8/15 (rollback), 18 (redirect URI, isolation). §6 win-back → Tasks 6, 8 (write); repoint is Plan 3. §7 rollout → Tasks 17–18 for Phase 1. §8 testing → unit tests throughout, Task 17 manual E2E + parity; resilience of the public site is Plan 2. §9 cost → Task 18 Step 1.
- **Type consistency:** `publishProgram`/`rollbackLastPublish` results are consumed exactly as defined in Task 8 by Tasks 14–15. `getStore()` is async everywhere (Task 11). `RecentPublish` lives in `store.ts` and is consumed by the Sidebar. `StatusPill` accepts `CohortStatus | ProgramPill`.
