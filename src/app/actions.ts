'use server'

import { revalidatePath } from 'next/cache'
import { signOut } from '@/auth'
import type { ProgramContent } from '@/lib/content-schema'
import { publishProgram, rollbackLastPublish, type PublishResult, type RollbackResult } from '@/lib/publish'
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

export async function rollbackAction(baseVersion: number): Promise<RollbackResult | Unauthorized> {
  const by = await adminOrNull()
  if (!by) return { ok: false, reason: 'unauthorized' }
  const result = await rollbackLastPublish(await getStore(), { baseVersion, by })
  if (result.ok) revalidatePath('/', 'layout')
  return result
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
