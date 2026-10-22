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
