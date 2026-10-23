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
