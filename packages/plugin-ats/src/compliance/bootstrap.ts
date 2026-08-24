import { SOWEE_TESTNET } from "@sowee/core";
import type { Address } from "viem";
import type { PreparedCall } from "../tx.js";
import { addToControlList, grantKyc, type GrantKycOptions } from "./index.js";

/** Participants that must be compliance-enabled on a bond for Sowee to operate. */
export interface BootstrapComplianceOptions {
  /** InvoiceMarket proxy — escrows and moves bond units. Defaults to the testnet deployment. */
  market?: Address;
  /** MaturitySettlement proxy — receives surrendered units at claim. Defaults to the testnet deployment. */
  settlement?: Address;
  /** Invoice issuer wallet. */
  issuer: Address;
  /** Initial investor wallets, if known upfront. */
  investors?: Address[];
  /** KYC grant options applied to every participant. */
  kyc?: GrantKycOptions;
  /** Also add every participant to the bond's control list (allowlist mode). Defaults to true. */
  updateControlList?: boolean;
}

/**
 * Build the batched compliance grants that make a freshly issued invoice bond tradable
 * through Sowee: the protocol contracts (market + settlement) and the human participants
 * are KYC'd — and, for allowlist-mode bonds, control-listed — in one atomic call list.
 *
 * Skipping the protocol contracts is the classic failure mode: every transfer through the
 * market would revert at the token layer. This helper makes the step impossible to half-do.
 *
 * Deliberately NOT executed automatically during issuance — granting KYC is a
 * compliance-officer act and stays an explicit step. Execute with `sendCall` per entry.
 */
export function bootstrapCompliance(
  token: Address,
  opts: BootstrapComplianceOptions,
): PreparedCall[] {
  const participants: Address[] = [
    opts.market ?? SOWEE_TESTNET.invoiceMarket,
    opts.settlement ?? SOWEE_TESTNET.maturitySettlement,
    opts.issuer,
    ...(opts.investors ?? []),
  ];

  const calls = participants.map((account) => grantKyc(token, account, opts.kyc));
  if (opts.updateControlList ?? true) {
    calls.push(...participants.map((account) => addToControlList(token, account)));
  }
  return calls;
}
