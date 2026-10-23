/**
 * The seven learner programs the portal manages (Securities Trading added 2026-10-20 on the public site). Keys are the public repo's
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
  'securities-trading',
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
  {
    slug: 'securities-trading',
    name: 'Securities Trading Programme',
    href: '/securities-trading',
    homeCardId: 'prog-securities-trading',
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
