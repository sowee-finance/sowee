import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatUsdc,
  HEDERA_TESTNET,
  MirrorNodeClient,
  SOWEE_TESTNET,
  sha256Hex,
  USDC_TESTNET,
} from "@sowee/core";
import {
  bootstrapCompliance,
  buildCreateInvoiceBondCall,
  factoryAbi,
  type PreparedCall,
} from "@sowee/plugin-ats";
import {
  type Address,
  BaseError,
  createPublicClient,
  createWalletClient,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  getAddress,
  type Hex,
  http,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import {
  atsExtrasAbi,
  invoiceMarketAbi,
  maturitySettlementAbi,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ROLE_KYC,
  ROLE_SSI_MANAGER,
} from "./abi.js";
import {
  type ApiAttestResult,
  type ApiInvoice,
  type ApiQuote,
  getJson,
  isHealthy,
  postJson,
  startApi,
  stripHexPrefix,
} from "./api.js";
import { loadState, saveState } from "./state.js";

// ---------------------------------------------------------------- constants

const E2E_DIR = fileURLToPath(new URL("..", import.meta.url));
const ROOT_DIR = join(E2E_DIR, "..", "..");
const STATE_PATH = join(E2E_DIR, "state.json");
const API_LOG_PATH = join(E2E_DIR, "api.log");
const API_DIR = join(ROOT_DIR, "apps", "api");

const DEPLOYER_ID = "0.0.7162116";
/** Invoice face value: 10 USDC (6 decimals). */
const FACE_VALUE = 10_000_000n;
/** Bond units offered (nominal value 1 USDC per unit). */
const UNITS = 10n;
/** Invoice tenor for the demo: maturity ~20 minutes out. */
const MATURITY_MS = 20 * 60_000;
/** Hedera per-transaction gas ceiling. */
const MAX_GAS = 15_000_000n;
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

const ENV_LINE_REGEX = /^([A-Z0-9_]+)=(.*)$/;

// ------------------------------------------------------------------ context

/** Clean early exit (stage checkpoint saved); not an error. */
class Halt extends Error {}

function createContext() {
  const walletPk = readWalletPk();
  const account = privateKeyToAccount(`0x${stripHexPrefix(walletPk)}`);
  const transport = http(HEDERA_TESTNET.rpcUrl);
  const pub = createPublicClient({ chain: hederaTestnet, transport });
  const wallet = createWalletClient({ account, chain: hederaTestnet, transport });
  const mirror = new MirrorNodeClient();
  const state = loadState(STATE_PATH);
  return {
    walletPk,
    account,
    pub,
    wallet,
    mirror,
    state,
    save(): void {
      saveState(STATE_PATH, state);
    },
  };
}

type Ctx = ReturnType<typeof createContext>;

function readWalletPk(): string {
  const envPath = join(ROOT_DIR, ".env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = ENV_LINE_REGEX.exec(line.trim());
    if (match?.[1] === "WALLET_PK" && match[2]) {
      return match[2];
    }
  }
  throw new Error(`WALLET_PK not found in ${envPath}`);
}

function need<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`state.${name} missing — delete scripts/e2e/state.json and re-run`);
  }
  return value;
}

// ------------------------------------------------------------------ helpers

const txLink = (hash: Hex): string => `${HEDERA_TESTNET.explorerUrl}/transaction/${hash}`;
const contractLink = (address: string): string =>
  `${HEDERA_TESTNET.explorerUrl}/contract/${address}`;
const topicLink = (topicId: string): string => `${HEDERA_TESTNET.explorerUrl}/topic/${topicId}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

function shortError(err: unknown): string {
  if (err instanceof BaseError) {
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

async function estimateGas(ctx: Ctx, call: PreparedCall, value?: bigint): Promise<bigint> {
  const estimated = await ctx.pub.estimateGas({
    account: ctx.account,
    to: call.to,
    data: call.data,
    ...(value !== undefined ? { value } : {}),
  });
  const padded = (estimated * 120n) / 100n;
  return padded > MAX_GAS ? MAX_GAS : padded;
}

interface SendOptions {
  value?: bigint;
  gas?: bigint;
}

/** Send a prepared call, wait for the receipt, and print a HashScan link. */
async function send(
  ctx: Ctx,
  label: string,
  call: PreparedCall,
  opts: SendOptions = {},
): Promise<Hex> {
  const gas = opts.gas ?? (await estimateGas(ctx, call, opts.value));
  const hash = await ctx.wallet.sendTransaction({
    to: call.to,
    data: call.data,
    gas,
    ...(opts.value !== undefined ? { value: opts.value } : {}),
  });
  const receipt = await ctx.pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted — ${txLink(hash)}`);
  }
  console.info(`  ok ${label}`);
  console.info(`     ${txLink(hash)}`);
  return hash;
}

function erc20Call(
  token: Address,
  functionName: "approve",
  args: readonly [Address, bigint],
): PreparedCall {
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName, args }) };
}

async function erc20BalanceOf(ctx: Ctx, token: Address, owner: Address): Promise<bigint> {
  return await ctx.pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

async function ensureAllowance(
  ctx: Ctx,
  token: Address,
  spender: Address,
  amount: bigint,
  label: string,
): Promise<void> {
  const allowance = await ctx.pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [ctx.account.address, spender],
  });
  if (allowance >= amount) {
    console.info(`  ok ${label} allowance already in place`);
    return;
  }
  await send(ctx, `approve ${label}`, erc20Call(token, "approve", [spender, amount]));
}

// ----------------------------------------------------------------- stage a

async function stagePreflight(ctx: Ctx): Promise<void> {
  const hbar = await ctx.pub.getBalance({ address: ctx.account.address });
  console.info(`  HBAR balance: ${formatEther(hbar)}`);
  if (hbar === 0n) {
    throw new Halt(`No HBAR — fund ${ctx.account.address} (account ${DEPLOYER_ID}) and re-run.`);
  }

  await ensureUsdcAssociation(ctx);

  const usdc = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, ctx.account.address);
  if (usdc === 0n) {
    throw new Halt(
      [
        "USDC balance is 0 — fund the wallet from the Circle faucet, then re-run:",
        "  1. Open https://faucet.circle.com",
        "  2. Select network: Hedera Testnet",
        `  3. Paste address: ${ctx.account.address}  (Hedera account ${DEPLOYER_ID})`,
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
    `accounts/${DEPLOYER_ID}/tokens?token.id=${USDC_TESTNET.tokenId}`,
  );
  if (page.tokens.length === 0) {
    // HIP-719: an EOA associates by calling associate() on the token's facade address.
    ctx.state.associateTx = await send(
      ctx,
      `associate ${DEPLOYER_ID} with USDC ${USDC_TESTNET.tokenId} (HIP-719)`,
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
      operatorId: DEPLOYER_ID,
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

/** The factory returns the new diamond address; read it from the mirror node's call_result. */
async function fetchDeployedBond(ctx: Ctx, hash: Hex): Promise<Address> {
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try {
      const result = await ctx.mirror.get<{ call_result?: string }>(`contracts/results/${hash}`);
      if (result.call_result && result.call_result !== "0x") {
        const bond = decodeFunctionResult({
          abi: factoryAbi,
          functionName: "deployBond",
          data: result.call_result as Hex,
        });
        return getAddress(bond);
      }
    } catch {
      // mirror node lag — keep polling
    }
  }
  throw new Error(`could not read deployBond result from mirror node for ${hash}`);
}

// ----------------------------------------------------------------- stage d

async function stageCompliance(ctx: Ctx): Promise<void> {
  if (ctx.state.complianceDone) {
    console.info("  ok compliance already bootstrapped");
    return;
  }
  const bond = need(ctx.state.bondAddress, "bondAddress");
  await ensureRoles(ctx, bond);
  await ensureSsiIssuer(ctx, bond);
  await ensureParticipantCompliance(ctx, bond);
  await ensureUnitsIssued(ctx, bond);
  ctx.state.complianceDone = true;
  ctx.save();
}

const SELF_ROLES = [
  { role: ROLE_SSI_MANAGER, label: "SSI manager" },
  { role: ROLE_KYC, label: "KYC" },
  { role: ROLE_CONTROL_LIST, label: "control list" },
  { role: ROLE_ISSUER, label: "issuer" },
] as const;

async function ensureRoles(ctx: Ctx, bond: Address): Promise<void> {
  for (const { role, label } of SELF_ROLES) {
    const has = await ctx.pub.readContract({
      address: bond,
      abi: atsExtrasAbi,
      functionName: "hasRole",
      args: [role, ctx.account.address],
    });
    if (has) {
      console.info(`  ok ${label} role already granted`);
      continue;
    }
    await send(ctx, `grant ${label} role to deployer`, {
      to: bond,
      data: encodeFunctionData({
        abi: atsExtrasAbi,
        functionName: "grantRole",
        args: [role, ctx.account.address],
      }),
    });
  }
}

/** grantKyc requires the KYC issuer to be on the bond's SSI issuer list (zero address is rejected). */
async function ensureSsiIssuer(ctx: Ctx, bond: Address): Promise<void> {
  const listed = await ctx.pub.readContract({
    address: bond,
    abi: atsExtrasAbi,
    functionName: "isIssuer",
    args: [ctx.account.address],
  });
  if (listed) {
    console.info("  ok deployer already on SSI issuer list");
    return;
  }
  await send(ctx, "add deployer to SSI issuer list", {
    to: bond,
    data: encodeFunctionData({
      abi: atsExtrasAbi,
      functionName: "addIssuer",
      args: [ctx.account.address],
    }),
  });
}

async function ensureParticipantCompliance(ctx: Ctx, bond: Address): Promise<void> {
  const participants: Address[] = [
    SOWEE_TESTNET.invoiceMarket,
    SOWEE_TESTNET.maturitySettlement,
    ctx.account.address,
  ];
  // Calls come back in a documented order: grantKyc per participant, then
  // addToControlList per participant — index into them to skip what's done.
  const calls = bootstrapCompliance(bond, {
    issuer: ctx.account.address,
    kyc: { issuer: ctx.account.address },
  });
  for (const [i, participant] of participants.entries()) {
    const status = await ctx.pub.readContract({
      address: bond,
      abi: atsExtrasAbi,
      functionName: "getKycStatusFor",
      args: [participant],
    });
    if (status !== 0) {
      console.info(`  ok KYC already granted for ${participant}`);
      continue;
    }
    await send(ctx, `grant KYC to ${participant}`, need(calls[i], `complianceCall[${i}]`));
  }
  for (const [i, participant] of participants.entries()) {
    const listed = await ctx.pub.readContract({
      address: bond,
      abi: atsExtrasAbi,
      functionName: "isInControlList",
      args: [participant],
    });
    if (listed) {
      console.info(`  ok control list already contains ${participant}`);
      continue;
    }
    const call = need(calls[participants.length + i], `complianceCall[${participants.length + i}]`);
    await send(ctx, `add ${participant} to control list`, call);
  }
}

async function ensureUnitsIssued(ctx: Ctx, bond: Address): Promise<void> {
  const supply = await ctx.pub.readContract({
    address: bond,
    abi: erc20Abi,
    functionName: "totalSupply",
  });
  if (supply >= UNITS) {
    console.info(`  ok ${supply} bond units already issued`);
    return;
  }
  await send(ctx, `issue ${UNITS} bond units to deployer`, {
    to: bond,
    data: encodeFunctionData({
      abi: atsExtrasAbi,
      functionName: "issue",
      args: [ctx.account.address, UNITS - supply, "0x"],
    }),
  });
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
  const invoiceId = need(ctx.state.invoiceId, "invoiceId");
  const bond = need(ctx.state.bondAddress, "bondAddress");
  const cost = UNITS * BigInt(need(ctx.state.pricePerUnit, "pricePerUnit"));
  const usdc = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, ctx.account.address);
  if (usdc < cost) {
    throw new Halt(
      `Need ${formatUsdc(cost)} USDC to fund the invoice but only ${formatUsdc(usdc)} available — top up at https://faucet.circle.com and re-run.`,
    );
  }
  await ensureAllowance(
    ctx,
    USDC_TESTNET.evmAddress,
    SOWEE_TESTNET.invoiceMarket,
    cost,
    "USDC -> market",
  );
  ctx.state.buyTx = await send(ctx, `buyPrimary: ${UNITS} units for ${formatUsdc(cost)} USDC`, {
    to: SOWEE_TESTNET.invoiceMarket,
    data: encodeFunctionData({
      abi: invoiceMarketAbi,
      functionName: "buyPrimary",
      args: [invoiceId, UNITS],
    }),
  });
  ctx.save();
  const units = await erc20BalanceOf(ctx, bond, ctx.account.address);
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
  const units = await erc20BalanceOf(ctx, bond, ctx.account.address);
  if (units === 0n) {
    console.info("  ok no bond units left to claim with");
    return;
  }
  await ensureAllowance(ctx, bond, SOWEE_TESTNET.maturitySettlement, units, "bond -> settlement");
  const before = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, ctx.account.address);
  ctx.state.claimTx = await send(ctx, `claim payout, surrendering ${units} bond units`, {
    to: SOWEE_TESTNET.maturitySettlement,
    data: encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "claim",
      args: [invoiceId],
    }),
  });
  ctx.save();
  const after = await erc20BalanceOf(ctx, USDC_TESTNET.evmAddress, ctx.account.address);
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
  const ctx = createContext();
  console.info(`Sowee e2e demo on Hedera testnet — wallet ${ctx.account.address} (${DEPLOYER_ID})`);
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
