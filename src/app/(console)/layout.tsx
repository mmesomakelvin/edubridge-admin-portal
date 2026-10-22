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
