import type { NextConfig } from "next"

const dev = process.env.NODE_ENV === "development"

// Reads go from the browser straight to the RPC, so the relay and mirror node must be
// reachable; anvil only in dev. Next's own inline bootstrap scripts need 'unsafe-inline'
// without a nonce setup, and the dev overlay needs 'unsafe-eval'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' https://testnet.hashio.io https://testnet.mirrornode.hedera.com${
    dev ? " http://127.0.0.1:8545 http://localhost:8545 ws://localhost:* ws://127.0.0.1:*" : ""
  }`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        // The KYC liveness widget (later issue) needs the camera and microphone.
        { key: "Permissions-Policy", value: "camera=*, microphone=*" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
}

export default nextConfig
