import type { NextConfig } from 'next'
import { AUTH_PAGES_CSP, SECURITY_HEADERS } from './src/lib/csp'

const config: NextConfig = {
  // sharp is a native module; keep it out of the server bundle.
  serverExternalPackages: ['sharp'],
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Auth.js's own pages bypass the proxy (and its nonce CSP), so they get a fixed no-script policy.
      { source: '/api/auth/:path*', headers: [{ key: 'Content-Security-Policy', value: AUTH_PAGES_CSP }] },
    ]
  },
}

export default config
