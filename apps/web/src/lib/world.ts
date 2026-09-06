import type { Address, Hex } from "viem"
import { get, post } from "./api"
import type { KycAuth } from "./kyc"

// Client for the API's World Selfie Check routes (apps/api README, "World Selfie Check").

/** `GET /v1/world/request`: what IDKit needs, with a server-signed RP context. */
export type WorldRequest = {
  app_id: `app_${string}`
  rp_id: `rp_${string}`
  action: string
  environment: "sandbox" | "production"
  rp_context: { sig: Hex; nonce: Hex; created_at: number; expires_at: number }
}

export const getWorldRequest = () => get<WorldRequest>("/v1/world/request")

/** `POST /v1/world/verify`: forwards the IDKit result as-is; the API records the signal. */
export const verifyWorld = (auth: KycAuth, result: unknown) =>
  post<{ selfieCheck: boolean; nullifier: string }>("/v1/world/verify", { ...auth, result })

/** IDKit takes the signature under `signature`; the API emits the idkit-server field name `sig`. */
export const toRpContext = (r: WorldRequest) => ({
  rp_id: r.rp_id,
  nonce: r.rp_context.nonce,
  created_at: r.rp_context.created_at,
  expires_at: r.rp_context.expires_at,
  signature: r.rp_context.sig,
})

export const worldSignal = (wallet: Address) => wallet.toLowerCase()
