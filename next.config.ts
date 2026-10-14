import type { NextConfig } from 'next'

const config: NextConfig = {
  // sharp is a native module; keep it out of the server bundle.
  serverExternalPackages: ['sharp'],
}

export default config
