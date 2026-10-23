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
