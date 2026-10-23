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
