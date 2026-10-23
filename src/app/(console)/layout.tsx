import type { ReactNode } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { adminOrRedirect } from '@/lib/session'
import { recentPublishes } from '@/lib/store'
import { getStore } from '@/lib/store-instance'

export const dynamic = 'force-dynamic'

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const email = await adminOrRedirect()
  const backups = await (await getStore()).listBackups()
  return (
    <div className="app">
      <Sidebar email={email} recent={recentPublishes(backups)} />
      <main className="main">{children}</main>
    </div>
  )
}
