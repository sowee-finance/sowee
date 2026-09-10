import type { NextConfig } from "next"

const dev = process.env.NODE_ENV === "development"
// A local chain is reached over plain http, which the CSP has to allow explicitly. This follows
// the configured chain rather than the build mode: `bun run build && bun run start` against anvil
// is a normal way to check a production build, and silently blocking its RPC reads as an empty
// marketplace with nothing but a console violation to explain it.
const localChain = (process.env.NEXT_PUBLIC_CHAIN_ID ?? "296") === "31337"
// The Go API (quotes, attestations). Read at build time; the client bundle inlines the same value.
const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").origin

// Reads go from the browser straight to the RPC, so the relay and mirror node must be reachable.
// Next's own inline bootstrap scripts need 'unsafe-inline' without a nonce setup, and the dev
// overlay needs 'unsafe-eval'. The Sumsub WebSDK is a CDN script that mounts an iframe on
// *.sumsub.com (KYC wizard, /kyc).
//
// 'wasm-unsafe-eval' is what lets World's Selfie Check run: @worldcoin/idkit-core is a
// WebAssembly module, and compiling one is script generation as far as the CSP is concerned.
// Remove it and every Selfie Check ends as `generic_error` — IDKit maps anything it does not
// recognise to that code and drops the real message, so the browser console is the only place
// the CompileError appears. Development never showed it, because 'unsafe-eval' permits wasm too.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.sumsub.com${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.sumsub.com https://*.worldcoin.org https://*.world.org",
  "font-src 'self'",
  `connect-src 'self' ${api} https://testnet.hashio.io https://testnet.mirrornode.hedera.com https://rpc.testnet.arc.network https://*.sumsub.com wss://*.sumsub.com https://*.worldcoin.org https://*.world.org wss://*.worldcoin.org${
    localChain ? " http://127.0.0.1:8545 http://localhost:8545" : ""
  }${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "frame-src https://*.sumsub.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const nextConfig: NextConfig = {
  // Do not write AGENTS.md / CLAUDE.md into this package; the repo root has its own guide.
  agentRules: false,
  // Traced output for the container image: the server plus only the files it actually reaches,
  // instead of the whole workspace and its node_modules. `next start` is unaffected.
  output: "standalone",
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
