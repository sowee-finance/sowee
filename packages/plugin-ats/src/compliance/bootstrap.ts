import { SOWEE_TESTNET } from "@sowee/core";
import type { Address } from "viem";
import { ROLE_CONTROL_LIST, ROLE_ISSUER, ROLE_KYC, ROLE_SSI_MANAGER } from "../constants.js";
import type { PreparedCall } from "../tx.js";
import { addIssuer, addToControlList, type GrantKycOptions, grantKyc, grantRole } from "./index.js";

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
  /** KYC grant options applied to every participant. `kyc.issuer` is required unless
   * `selfSetup` is set (it then defaults to the admin). */
  kyc?: GrantKycOptions;
  /** Also add every participant to the bond's control list (allowlist mode). Defaults to true. */
  updateControlList?: boolean;
  /**
   * Self-setup for a freshly deployed bond whose admin runs its own compliance desk.
   * Prepends `grantRole(ROLE_SSI_MANAGER | ROLE_KYC | ROLE_CONTROL_LIST | ROLE_ISSUER)`
   * and `addIssuer` for `admin`, and defaults the KYC issuer to `admin` — the exact
   * sequence proven on-chain by the live e2e run (fresh bond → fund-ready).
   */
  selfSetup?: { admin: Address };
}

/**
 * Build the batched compliance grants that make a freshly issued invoice bond tradable
 * through Sowee: the protocol contracts (market + settlement) and the human participants
 * are KYC'd — and, for allowlist-mode bonds, control-listed — in one atomic call list.
 * With `selfSetup`, the list starts from a factory-fresh bond (the creator only holds
 * DEFAULT_ADMIN_ROLE): the operational roles are self-granted and the admin is registered
 * as SSI issuer first, so the whole sequence runs against a brand-new diamond.
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

  const calls: PreparedCall[] = [];
  let kyc = opts.kyc;
  if (opts.selfSetup) {
    const { admin } = opts.selfSetup;
    for (const role of [ROLE_SSI_MANAGER, ROLE_KYC, ROLE_CONTROL_LIST, ROLE_ISSUER]) {
      calls.push(grantRole(token, role, admin));
    }
    calls.push(addIssuer(token, admin));
    kyc = { issuer: admin, ...kyc };
  }
  calls.push(...participants.map((account) => grantKyc(token, account, kyc)));
  if (opts.updateControlList ?? true) {
    calls.push(...participants.map((account) => addToControlList(token, account)));
  }
  return calls;
}
