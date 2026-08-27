import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatUsdc, SOWEE_TESTNET, sha256Hex, USDC_TESTNET } from "@sowee/core";
import { buildCreateInvoiceBondCall, type PreparedCall } from "@sowee/plugin-ats";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  type Hex,
  zeroAddress,
} from "viem";
import { invoiceMarketAbi, maturitySettlementAbi } from "./abi.js";
import {
  type ApiAttestResult,
  type ApiInvoice,
  type ApiQuote,
  getJson,
  isHealthy,
  postJson,
  startApi,
} from "./api.js";
import {
  contractLink,
  createChainCtx,
  ensureAllowance,
  ensureParticipantCompliance,
  ensureRoles,
  ensureSsiIssuer,
  ensureUnitsIssued,
  erc20BalanceOf,
  fetchDeployedBond,
  Halt,
  nowSeconds,
  readEnvKey,
  readWalletPk,
  send,
  shortError,
  sleep,
  topicLink,
} from "./shared.js";
import { type DemoState, loadState, saveState } from "./state.js";

// ---------------------------------------------------------------- constants

const E2E_DIR = fileURLToPath(new URL("..", import.meta.url));
const ROOT_DIR = join(E2E_DIR, "..", "..");
const STATE_PATH = join(E2E_DIR, "state.json");
const API_LOG_PATH = join(E2E_DIR, "api.log");
const API_DIR = join(ROOT_DIR, "apps", "api");

/** Invoice face value: 10 USDC (6 decimals). */
const FACE_VALUE = 10_000_000n;
/** Bond units offered (nominal value 1 USDC per unit). */
const UNITS = 10n;
/** Invoice tenor for the demo: maturity ~20 minutes out. */
const MATURITY_MS = 20 * 60_000;
/** HIP-719 EOA association is not estimable via the facade; fixed gas. */
const ASSOCIATE_GAS = 900_000n;
/** `associate()` selector on the HTS token facade (HIP-719). */
const ASSOCIATE_CALLDATA: Hex = "0x0a754de6";
/** HBAR attached to scheduleSettlement to cover the HSS scheduled-execution fee. */
const SCHEDULE_VALUE = 3n * 10n ** 18n;
/**
 * The v8 ATS factory validates a full ISO 6166 ISIN (12 chars + Luhn checksum) and
 * rejects the plugin's empty-string default with WrongISIN. Any checksum-valid ISIN
 * works; this one is a neutral placeholder ("SW0WEE00000" + check digit 4).
 */
const DEMO_ISIN = "SW0WEE000004";

// ------------------------------------------------------------------ context

function createContext() {
  const chain = createChainCtx(readWalletPk(ROOT_DIR));
  const investorPk = readEnvKey(ROOT_DIR, "INVESTOR_PK");
  // A second wallet for the buy/claim legs: HTS rejects buyer == issuer
  // (ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS on the USDC facade self-transfer),
  // so a single-wallet demo cannot fund its own invoice.
  const investor = investorPk ? createChainCtx(investorPk) : undefined;
  const state = loadState<DemoState>(STATE_PATH);
  return {
    ...chain,
    investor,
    state,
    save(): void {
      saveState(STATE_PATH, state);
    },
  };
}

type Ctx = ReturnType<typeof createContext> & { accountId: string };

/** Resolve the wallet's Hedera account id (0.0.x) from its EVM address. */
async function resolveAccountId(ctx: ReturnType<typeof createContext>): Promise<string> {
  try {
    const res = await ctx.mirror.get<{ account: string }>(`accounts/${ctx.account.address}`);
    return res.account;
  } catch {
    throw new Halt(
      `Wallet ${ctx.account.address} has no Hedera account yet — fund it with HBAR ` +
        "(portal.hedera.com), wait ~30s for the mirror node, then re-run.",
    );
  }
}

function need<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`state.${name} missing — delete scripts/e2e/state.json and re-run`);
  }
  return value;
}

// ----------------------------------------------------------------- stage a

async function stagePreflight(ctx: Ctx): Promise<void> {
  const hbar = await ctx.pub.getBalance({ address: ctx.account.address });
  console.info(`  HBAR balance: ${formatEther(hbar)}`);
  if (hbar === 0n) {
    throw new Halt(`No HBAR — fund ${ctx.account.address} (account ${ctx.accountId}) and re-run.`);
  }

  await ensureUsdcAssociation(ctx);

  const usdc = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, ctx.account.address);
  if (usdc === 0n) {
    throw new Halt(
      [
        "USDC balance is 0 — fund the wallet from the Circle faucet, then re-run:",
        "  1. Open https://faucet.circle.com",
        "  2. Select network: Hedera Testnet",
        `  3. Paste address: ${ctx.account.address}  (Hedera account ${ctx.accountId})`,
        "  4. Re-run: pnpm --filter @sowee/e2e-demo demo",
        "Progress so far is saved in scripts/e2e/state.json; the demo resumes automatically.",
      ].join("\n"),
    );
  }
  console.info(`  USDC balance: ${formatUsdc(usdc)}`);
}

async function ensureUsdcAssociation(ctx: Ctx): Promise<void> {
  if (ctx.state.associated) {
    console.info("  ok USDC association (from state)");
    return;
  }
  const page = await ctx.mirror.get<{ tokens: unknown[] }>(
    `accounts/${ctx.accountId}/tokens?token.id=${USDC_TESTNET.tokenId}`,
  );
  if (page.tokens.length === 0) {
    // HIP-719: an EOA associates by calling associate() on the token's facade address.
    ctx.state.associateTx = await send(
      ctx,
      `associate ${ctx.accountId} with USDC ${USDC_TESTNET.tokenId} (HIP-719)`,
      { to: USDC_TESTNET.evmAddress, data: ASSOCIATE_CALLDATA },
      { gas: ASSOCIATE_GAS },
    );
  } else {
    console.info("  ok USDC already associated");
  }
  ctx.state.associated = true;
  ctx.save();
}

// ----------------------------------------------------------------- stage b

async function stageApiUp(ctx: Ctx): Promise<void> {
  if (await isHealthy()) {
    console.info("  ok Go API already healthy");
  } else {
    await startApi({
      apiDir: API_DIR,
      logPath: API_LOG_PATH,
      operatorId: ctx.accountId,
      walletKey: ctx.walletPk,
      topicId: ctx.state.topicId,
      onTopicId: (topicId) => {
        ctx.state.topicId = topicId;
        ctx.save();
      },
    });
    console.info("  ok Go API healthy (spawned; logs in scripts/e2e/api.log)");
  }
  if (ctx.state.topicId) {
    console.info(`  HCS topic ${ctx.state.topicId}`);
    console.info(`     ${topicLink(ctx.state.topicId)}`);
  }
}

// ----------------------------------------------------------------- stage c

async function stageIssueBond(ctx: Ctx): Promise<void> {
  if (ctx.state.bondAddress) {
    console.info(`  ok bond already issued at ${ctx.state.bondAddress}`);
    return;
  }
  const dueDate = new Date(Date.now() + MATURITY_MS);
  const invoice = await registerApiInvoice(ctx, dueDate);
  console.info(`  ok invoice registered with API: ${invoice.id}`);
  console.info(`     invoiceId ${invoice.invoiceId}`);

  const maturity = ctx.state.maturity ?? 0;
  const call = buildCreateInvoiceBondCall({
    invoiceId: invoice.invoiceId,
    faceValue: FACE_VALUE,
    maturityDate: BigInt(maturity),
    admin: ctx.account.address,
    isin: DEMO_ISIN,
  });
  const hash = await send(ctx, "deployBond via ATS factory", call);
  ctx.state.bondTx = hash;
  ctx.state.bondAddress = await fetchDeployedBond(ctx, hash);
  ctx.save();
  console.info(`  ok bond diamond at ${ctx.state.bondAddress}`);
  console.info(`     ${contractLink(ctx.state.bondAddress)}`);
}

async function registerApiInvoice(ctx: Ctx, dueDate: Date): Promise<ApiInvoice> {
  const invoice = await postJson<ApiInvoice>("/invoices", {
    payor: ctx.account.address,
    faceValue: FACE_VALUE.toString(),
    dueDate: dueDate.toISOString(),
    docHash: sha256Hex(`sowee-e2e-demo ${ctx.account.address} ${Date.now()}`),
  });
  ctx.state.invoiceUuid = invoice.id;
  ctx.state.invoiceId = invoice.invoiceId;
  ctx.state.maturity = Math.floor(dueDate.getTime() / 1000);
  ctx.save();
  return invoice;
}

// ----------------------------------------------------------------- stage d

async function stageCompliance(ctx: Ctx): Promise<void> {
  const bond = need(ctx.state.bondAddress, "bondAddress");
  const investors = ctx.investor ? [ctx.investor.account.address] : [];
  if (ctx.state.complianceDone) {
    if (investors.length === 0) {
      console.info("  ok compliance already bootstrapped");
      return;
    }
    // The checkpoint predates today's participant set: an INVESTOR_PK added
    // after the first run (exactly what the stage-f halt instructs) still
    // needs its grants. The pass is idempotent per wallet — a covered
    // investor costs two view calls, an uncovered one gets what's missing.
    await ensureParticipantCompliance(ctx, bond, investors);
    return;
  }
  await ensureRoles(ctx, bond);
  await ensureSsiIssuer(ctx, bond);
  await ensureParticipantCompliance(ctx, bond, investors);
  await ensureUnitsIssued(ctx, bond, UNITS);
  ctx.state.complianceDone = true;
  ctx.save();
}

// ----------------------------------------------------------------- stage e

async function stageQuoteAndList(ctx: Ctx): Promise<void> {
  if (ctx.state.listTx) {
    console.info("  ok invoice already listed");
    return;
  }
  const bond = need(ctx.state.bondAddress, "bondAddress");
  const maturity = need(ctx.state.maturity, "maturity");
  if (nowSeconds() >= maturity - 120) {
    throw new Halt(
      "Invoice maturity is (nearly) past; the pipeline can no longer complete. " +
        "Delete scripts/e2e/state.json and re-run to issue a fresh bond.",
    );
  }
  const uuid = await ensureApiInvoice(ctx);
  const quote = await postJson<ApiQuote>(`/invoices/${uuid}/quote`, {});
  const invoiceId = need(ctx.state.invoiceId, "invoiceId");
  if (quote.invoiceId.toLowerCase() !== invoiceId.toLowerCase()) {
    throw new Error(`API quote invoiceId ${quote.invoiceId} does not match state ${invoiceId}`);
  }
  console.info(
    `  ok signed quote: ${quote.discountRateBps} bps discount on ${formatUsdc(BigInt(quote.faceValue))} USDC (nonce ${quote.nonce})`,
  );

  await ensureAllowance(ctx, bond, SOWEE_TESTNET.invoiceMarket, UNITS, "bond -> market");
  ctx.state.listTx = await send(ctx, "listInvoice on InvoiceMarket", {
    to: SOWEE_TESTNET.invoiceMarket,
    data: encodeFunctionData({
      abi: invoiceMarketAbi,
      functionName: "listInvoice",
      args: [
        invoiceId,
        bond,
        UNITS,
        BigInt(maturity),
        {
          invoiceId: quote.invoiceId,
          faceValue: BigInt(quote.faceValue),
          discountRateBps: quote.discountRateBps,
          validUntil: BigInt(quote.validUntil),
          nonce: BigInt(quote.nonce),
        },
        quote.signature,
      ],
    }),
  });
  // Checkpoint immediately: if the price readback below hiccups, a re-run must
  // see listTx — re-sending listInvoice reverts AlreadyListed and wedges the
  // pipeline until a fresh bond is burned.
  ctx.save();
  const listing = await ctx.pub.readContract({
    address: SOWEE_TESTNET.invoiceMarket,
    abi: invoiceMarketAbi,
    functionName: "invoices",
    args: [invoiceId],
  });
  ctx.state.pricePerUnit = listing[3].toString();
  ctx.save();
  console.info(
    `  primary price: ${formatUsdc(listing[3])} USDC per unit, ${listing[4]} units listed`,
  );
}

/**
 * The Go API keeps invoices in memory. If it restarted since stage c, re-register
 * the invoice (same maturity) and adopt the new invoiceId — the bond itself does
 * not depend on it. Once the invoice is LISTED on-chain the id is locked, so a
 * post-listing API restart cannot be healed automatically.
 * ponytail: in-memory API registry; persistent storage in apps/api removes this ceiling.
 */
async function ensureApiInvoice(ctx: Ctx): Promise<string> {
  const uuid = need(ctx.state.invoiceUuid, "invoiceUuid");
  try {
    await getJson<ApiInvoice>(`/invoices/${uuid}`);
    return uuid;
  } catch {
    if (ctx.state.listTx) {
      throw new Error(
        "The Go API restarted and lost the invoice registry after the invoice was listed on-chain. " +
          "Delete scripts/e2e/state.json and re-run the demo from a fresh bond.",
      );
    }
    const maturity = need(ctx.state.maturity, "maturity");
    console.warn("  API lost the invoice (restart); re-registering with the same maturity");
    const invoice = await registerApiInvoice(ctx, new Date(maturity * 1000));
    return invoice.id;
  }
}

// ----------------------------------------------------------------- stage f

async function stageFund(ctx: Ctx): Promise<void> {
  if (ctx.state.buyTx) {
    console.info("  ok primary purchase already done");
    return;
  }
  const inv = ctx.investor;
  if (!inv) {
    throw new Halt(
      "Funding needs a second wallet: set INVESTOR_PK in .env. HTS rejects buyer == issuer (ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS), so the deployer cannot buy its own listing.",
    );
  }
  const invoiceId = need(ctx.state.invoiceId, "invoiceId");
  const bond = need(ctx.state.bondAddress, "bondAddress");
  const cost = UNITS * BigInt(need(ctx.state.pricePerUnit, "pricePerUnit"));
  const usdc = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, inv.account.address);
  if (usdc < cost) {
    // Cover the investor from the deployer's balance when possible.
    const deployerUsdc = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, ctx.account.address);
    if (deployerUsdc < cost - usdc) {
      throw new Halt(
        `Investor needs ${formatUsdc(cost)} USDC but holds ${formatUsdc(usdc)} and the deployer cannot cover the difference — top up at https://faucet.circle.com and re-run.`,
      );
    }
    await send(ctx, `transfer ${formatUsdc(cost - usdc)} USDC to the investor wallet`, {
      to: USDC_TESTNET.evmAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [inv.account.address, cost - usdc],
      }),
    });
  }
  await ensureAllowance(
    inv,
    USDC_TESTNET.evmAddress,
    SOWEE_TESTNET.invoiceMarket,
    cost,
    "USDC -> market (investor)",
  );
  ctx.state.buyTx = await send(inv, `buyPrimary: ${UNITS} units for ${formatUsdc(cost)} USDC`, {
    to: SOWEE_TESTNET.invoiceMarket,
    data: encodeFunctionData({
      abi: invoiceMarketAbi,
      functionName: "buyPrimary",
      args: [invoiceId, UNITS],
    }),
  });
  ctx.save();
  const units = await erc20BalanceOf(ctx, bond, inv.account.address);
  console.info(`  investor now holds ${units} bond units`);
}

// ----------------------------------------------------------------- stage g

async function stageAttest(ctx: Ctx): Promise<void> {
  if (ctx.state.attested) {
    console.info("  ok attestations already anchored");
    return;
  }
  const uuid = await ensureApiInvoice(ctx);
  for (const event of ["issued", "funded"]) {
    const res = await postJson<ApiAttestResult>(`/invoices/${uuid}/attest`, { event });
    if (res.mode !== "submitted" || !res.topicId) {
      throw new Error(`attest "${event}" not submitted to HCS (mode=${res.mode})`);
    }
    ctx.state.topicId = res.topicId;
    ctx.save();
    console.info(`  ok attested "${event}" (topic ${res.topicId}, seq ${res.sequenceNumber})`);
  }
  const topicId = need(ctx.state.topicId, "topicId");
  await verifyTopicMessages(ctx, topicId);
  ctx.state.attested = true;
  ctx.save();
  console.info(`     ${topicLink(topicId)}`);
}

async function verifyTopicMessages(ctx: Ctx, topicId: string): Promise<void> {
  const invoiceId = need(ctx.state.invoiceId, "invoiceId");
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try {
      const messages = await ctx.mirror.getTopicMessages(topicId, { limit: 50, order: "desc" });
      const mine = messages.filter((m) => m.message.includes(invoiceId));
      const hasIssued = mine.some((m) => m.message.includes('"issued"'));
      const hasFunded = mine.some((m) => m.message.includes('"funded"'));
      if (hasIssued && hasFunded) {
        console.info(`  ok mirror node confirms issued+funded attestations on topic ${topicId}`);
        return;
      }
    } catch {
      // mirror node lag — keep polling
    }
  }
  throw new Error(`attestations not visible on mirror node topic ${topicId} after 60s`);
}

// ----------------------------------------------------------------- stage h

async function stageSettle(ctx: Ctx): Promise<void> {
  const invoiceId = need(ctx.state.invoiceId, "invoiceId");
  const bond = need(ctx.state.bondAddress, "bondAddress");
  const maturity = need(ctx.state.maturity, "maturity");

  await ensureRegistered(ctx, invoiceId, bond, maturity);
  await ensureDeposited(ctx, invoiceId);
  await ensureScheduled(ctx, invoiceId);
  await waitForMaturity(maturity);
  await ensureSettled(ctx, invoiceId, maturity);
  await claimPayout(ctx, invoiceId, bond);
}

type SettlementView = readonly [Address, bigint, bigint, bigint, bigint, bigint, boolean];

async function readSettlement(ctx: Ctx, invoiceId: Hex): Promise<SettlementView> {
  return await ctx.pub.readContract({
    address: SOWEE_TESTNET.maturitySettlement,
    abi: maturitySettlementAbi,
    functionName: "settlements",
    args: [invoiceId],
  });
}

async function ensureRegistered(
  ctx: Ctx,
  invoiceId: Hex,
  bond: Address,
  maturity: number,
): Promise<void> {
  const [registeredBond] = await readSettlement(ctx, invoiceId);
  if (registeredBond !== zeroAddress) {
    console.info("  ok invoice already registered for settlement");
    return;
  }
  if (nowSeconds() >= maturity - 30) {
    throw new Halt(
      "Maturity already passed before settlement registration. " +
        "Delete scripts/e2e/state.json and re-run to issue a fresh bond.",
    );
  }
  ctx.state.registerTx = await send(ctx, "registerInvoice on MaturitySettlement", {
    to: SOWEE_TESTNET.maturitySettlement,
    data: encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "registerInvoice",
      args: [invoiceId, bond, BigInt(maturity)],
    }),
  });
  ctx.save();
}

async function ensureDeposited(ctx: Ctx, invoiceId: Hex): Promise<void> {
  const [, , repayment] = await readSettlement(ctx, invoiceId);
  if (repayment >= FACE_VALUE) {
    console.info(`  ok repayment of ${formatUsdc(repayment)} USDC already deposited`);
    return;
  }
  const amount = FACE_VALUE - repayment;
  await ensureAllowance(
    ctx,
    USDC_TESTNET.evmAddress,
    SOWEE_TESTNET.maturitySettlement,
    amount,
    "USDC -> settlement",
  );
  ctx.state.depositTx = await send(ctx, `deposit ${formatUsdc(amount)} USDC repayment (payor)`, {
    to: SOWEE_TESTNET.maturitySettlement,
    data: encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "deposit",
      args: [invoiceId, amount],
    }),
  });
  ctx.save();
}

/** Try HSS scheduling; on any failure fall back to a manual settle() after maturity. */
async function ensureScheduled(ctx: Ctx, invoiceId: Hex): Promise<void> {
  if (ctx.state.scheduleTx || ctx.state.scheduleFallback) {
    console.info("  ok settlement scheduling already decided");
    return;
  }
  const call: PreparedCall = {
    to: SOWEE_TESTNET.maturitySettlement,
    data: encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "scheduleSettlement",
      args: [invoiceId],
    }),
  };
  try {
    // Simulation exercises hasScheduleCapacity + scheduleCall before spending gas.
    await ctx.pub.call({
      account: ctx.account.address,
      to: call.to,
      data: call.data,
      value: SCHEDULE_VALUE,
    });
    ctx.state.scheduleTx = await send(ctx, "scheduleSettlement via Hedera Schedule Service", call, {
      value: SCHEDULE_VALUE,
    });
  } catch (err) {
    console.warn(
      `  HSS scheduling unavailable (${shortError(err)}); will settle() manually after maturity`,
    );
    ctx.state.scheduleFallback = true;
  }
  ctx.save();
}

async function waitForMaturity(maturity: number): Promise<void> {
  let remaining = maturity + 5 - nowSeconds();
  while (remaining > 0) {
    console.info(`  waiting for maturity: ${remaining}s remaining`);
    await sleep(Math.min(remaining, 30) * 1000);
    remaining = maturity + 5 - nowSeconds();
  }
  console.info("  ok maturity reached");
}

async function ensureSettled(ctx: Ctx, invoiceId: Hex, maturity: number): Promise<void> {
  // Give a scheduled settle up to 2 minutes past maturity to fire before doing it manually.
  const scheduled = Boolean(ctx.state.scheduleTx);
  const deadline = maturity + (scheduled ? 120 : 0);
  for (;;) {
    const [, , , , , , settled] = await readSettlement(ctx, invoiceId);
    if (settled) {
      console.info(`  ok settlement executed${scheduled ? " (via scheduled call)" : ""}`);
      return;
    }
    if (nowSeconds() >= deadline) {
      break;
    }
    console.info("  waiting for scheduled settle() to fire...");
    await sleep(10_000);
  }
  ctx.state.settleTx = await send(ctx, "settle() (permissionless manual fallback)", {
    to: SOWEE_TESTNET.maturitySettlement,
    data: encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "settle",
      args: [invoiceId],
    }),
  });
  ctx.save();
}

async function claimPayout(ctx: Ctx, invoiceId: Hex, bond: Address): Promise<void> {
  if (ctx.state.claimTx) {
    console.info("  ok payout already claimed");
    return;
  }
  const holder = ctx.investor ?? ctx;
  const units = await erc20BalanceOf(ctx, bond, holder.account.address);
  if (units === 0n) {
    console.info("  ok no bond units left to claim with");
    return;
  }
  await ensureAllowance(
    holder,
    bond,
    SOWEE_TESTNET.maturitySettlement,
    units,
    "bond -> settlement",
  );
  const before = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, holder.account.address);
  ctx.state.claimTx = await send(holder, `claim payout, surrendering ${units} bond units`, {
    to: SOWEE_TESTNET.maturitySettlement,
    data: encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "claim",
      args: [invoiceId],
    }),
  });
  ctx.save();
  const after = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, holder.account.address);
  console.info(`  investor received ${formatUsdc(after - before)} USDC at maturity`);
}

// -------------------------------------------------------------------- main

const STAGES: readonly [string, (ctx: Ctx) => Promise<void>][] = [
  ["a. preflight", stagePreflight],
  ["b. api-up", stageApiUp],
  ["c. issue-bond", stageIssueBond],
  ["d. compliance", stageCompliance],
  ["e. quote+list", stageQuoteAndList],
  ["f. fund", stageFund],
  ["g. attest", stageAttest],
  ["h. settle", stageSettle],
];

async function main(): Promise<void> {
  const base = createContext();
  const ctx: Ctx = Object.assign(base, { accountId: await resolveAccountId(base) });
  console.info(`Sowee e2e demo on Hedera testnet — wallet ${ctx.account.address} (${ctx.accountId})`);
  for (const [name, run] of STAGES) {
    console.info(`\n=== stage ${name}`);
    await run(ctx);
  }
  console.info("\nAll stages complete. The invoice was issued, financed, attested, and settled.");
  if (ctx.state.topicId) {
    console.info(`Audit trail: ${topicLink(ctx.state.topicId)}`);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  if (err instanceof Halt) {
    console.info(`\n${err.message}`);
    process.exit(0);
  }
  console.error(`\ndemo failed: ${shortError(err)}`);
  console.error(err);
  process.exit(1);
});
