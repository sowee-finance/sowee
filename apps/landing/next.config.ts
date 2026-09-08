import type { NextConfig } from "next"

// The landing page reads the market straight from the chain, so the relay and the mirror node
// have to be reachable; nothing else does.
const rpc = process.env.NEXT_PUBLIC_RPC_URL ?? "https://testnet.hashio.io/api"
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  `connect-src 'self' ${new URL(rpc).origin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
}

export default nextConfig
