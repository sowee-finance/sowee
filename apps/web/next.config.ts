import type { NextConfig } from "next"

const dev = process.env.NODE_ENV === "development"
// The Go API (quotes, attestations). Read at build time; the client bundle inlines the same value.
const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").origin

// Reads go from the browser straight to the RPC, so the relay and mirror node must be
// reachable; anvil only in dev. Next's own inline bootstrap scripts need 'unsafe-inline'
// without a nonce setup, and the dev overlay needs 'unsafe-eval'. The Sumsub WebSDK is a CDN
// script that mounts an iframe on *.sumsub.com (KYC wizard, /kyc).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://static.sumsub.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.sumsub.com",
  "font-src 'self'",
  `connect-src 'self' ${api} https://testnet.hashio.io https://testnet.mirrornode.hedera.com https://*.sumsub.com wss://*.sumsub.com${
    dev ? " http://127.0.0.1:8545 http://localhost:8545 ws://localhost:* ws://127.0.0.1:*" : ""
  }`,
  "frame-src https://*.sumsub.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const nextConfig: NextConfig = {
  // Do not write AGENTS.md / CLAUDE.md into this package; the repo root has its own guide.
  agentRules: false,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        // The Sumsub liveness widget needs the camera and microphone.
        { key: "Permissions-Policy", value: "camera=*, microphone=*" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
}

export default nextConfig
