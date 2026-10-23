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
                  <b>{r.restoredFrom === undefined ? 'Published' : `Rolled back to v${r.restoredFrom}`}</b>
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
