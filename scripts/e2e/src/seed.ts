import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatUsdc, SOWEE_TESTNET, sha256Hex } from "@sowee/core";
import { buildCreateInvoiceBondCall } from "@sowee/plugin-ats";
import {
  type Address,
  encodeFunctionData,
  formatEther,
  getAddress,
  keccak256,
  stringToHex,
} from "viem";
import { invoiceMarketAbi } from "./abi.js";
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
  type ChainCtx,
  contractLink,
  createChainCtx,
  ensureAllowance,
  ensureParticipantCompliance,
  ensureRoles,
  ensureSsiIssuer,
  ensureUnitsIssued,
  fetchDeployedBond,
  Halt,
  listInvoiceLeg,
  nowSeconds,
  readWalletPk,
  send,
  shortError,
  topicLink,
} from "./shared.js";
import { type DemoState, loadState, saveState } from "./state.js";

/**
 * Market seeder: issues and lists a curated set of realistic invoice bonds on
 * Hedera testnet through the exact pipeline proven by demo.ts (ATS deployBond
 * with derived ISIN -> role grants -> SSI issuer -> compliance -> mint ->
 * API quote -> approve -> InvoiceMarket.listInvoice -> HCS "issued" attest).
 *
 * Re-runs resume from scripts/e2e/seed-state.json (gitignored).
 */

// ----------------------------------------------------------------- dataset

/**
 * Fictional but economically grounded invoice profiles. Fee grounding: factoring
 * discount fees commonly run 1-3% of face value per month (industry average
 * ~2.5% per 30 days; freight flat fees 1.5-5%) — FundThrough "Invoice Factoring
 * Rates" (2025), CapFlow Funding, Crestmont Capital, altLINE. Sector grounding:
 * trucking/freight, staffing, manufacturing, construction subcontracting,
 * wholesale distribution, healthcare, and import/export (incl. textiles) are the
 * dominant factoring verticals — Riviera Finance, Crestmont Capital.
 *
 * The listed discount comes from the Go API's deterministic FixedPlusTenor
 * strategy (200 bps + 25 bps per full 30-day bucket), which sits inside the
 * researched 1-3%/month band for these tenors; `expectedBps` documents it.
 */
interface SeedProfile {
  key: string;
  issuerName: string;
  payorName: string;
  sector: string;
  /** Whole USDC; also the number of 1-USDC bond units minted and listed. */
  faceUsdc: number;
  tenorDays: number;
  /** FixedPlusTenor(200 + 25 * floor(tenor/30d)) — logged vs the live quote. */
  expectedBps: number;
  /** One-line grounding: sector norm + fee-range source. */
  grounding: string;
}

const PROFILES: readonly SeedProfile[] = [
  {
    key: "garment-45d",
    issuerName: "PT Andalan Tekstil Mandiri",
    payorName: "Nusantara Retail Group",
    sector: "garment/textile export",
    faceUsdc: 24_500,
    tenorDays: 45,
    expectedBps: 225,
    grounding:
      "apparel export invoices commonly run low tens of thousands USD per LC-backed shipment (documented garment proforma ~$12.4k; textiles a top factoring vertical — Riviera Finance); 2.25% flat ~ 1.5%/mo, inside the 1-3%/mo band (FundThrough 2025)",
  },
  {
    key: "freight-25d",
    issuerName: "Adriatic Freight Solutions d.o.o.",
    payorName: "Bavaria Machinery Group",
    sector: "freight & logistics",
    faceUsdc: 9_800,
    tenorDays: 25,
    expectedBps: 200,
    grounding:
      "trucking/freight is the largest factoring vertical with 30-60d broker terms and small invoices factored in batches (DAT, Apex Capital); flat freight fees 1.5-5% (altLINE) — 2.0% flat on 25d fits",
  },
  {
    key: "pharma-30d",
    issuerName: "Deccan Pharma Distributors",
    payorName: "Crescent Hospitals Group",
    sector: "pharma distribution",
    faceUsdc: 38_750,
    tenorDays: 30,
    expectedBps: 225,
    grounding:
      "healthcare/wholesale distribution are core factoring users on 30-60d hospital terms (Crestmont Capital); 2.25%/30d ~ the ~2.5%/30d industry average (FundThrough 2025)",
  },
  {
    key: "agri-60d",
    issuerName: "Cafetales del Sur S.A.",
    payorName: "Pacific Grain Traders Ltd",
    sector: "agri commodity export (coffee)",
    faceUsdc: 62_000,
    tenorDays: 60,
    expectedBps: 250,
    grounding:
      "import/export trade factors structurally (Crestmont Capital) and container-scale commodity shipments run $50k+; 2.5% flat on 60d ~ 1.25%/mo, the insured-receivable low end of 1-3%/mo (FundThrough 2025)",
  },
  {
    key: "construction-55d",
    issuerName: "Bosphorus Build Contracting",
    payorName: "Anatolia Infrastructure Holding",
    sector: "construction subcontracting",
    faceUsdc: 85_000,
    tenorDays: 55,
    expectedBps: 225,
    grounding:
      "construction subcontractors factor large progress billings against slow-paying GCs (Riviera Finance, Crestmont Capital); 2.25% flat on 55d ~ 1.2%/mo, low end of the band for secured progress claims",
  },
  {
    key: "garment-90d",
    issuerName: "Mekong Garment Works",
    payorName: "Northline Apparel Buyers Ltd",
    sector: "garment export (long terms)",
    faceUsdc: 47_500,
    tenorDays: 90,
    expectedBps: 275,
    grounding:
      "90d payment terms are common for offshore apparel buyers and price above shorter tenors (tiered fees grow with tenor — Crestmont Capital); FixedPlusTenor caps this at 2.75% flat",
  },
  {
    key: "staffing-30d",
    issuerName: "Meridian Staffing Partners",
    payorName: "Atlas Logistics Corp",
    sector: "staffing & workforce",
    faceUsdc: 18_400,
    tenorDays: 30,
    expectedBps: 225,
    grounding:
      "staffing is a canonical factoring vertical: agencies pay weekly payroll against 30-45d client terms (Riviera Finance); 2.25%/30d sits at the industry average",
  },
  {
    key: "seafood-40d",
    issuerName: "Coral Coast Seafoods Ltd",
    payorName: "Tokyo Fresh Markets KK",
    sector: "fisheries export",
    faceUsdc: 27_300,
    tenorDays: 40,
    expectedBps: 225,
    grounding:
      "perishables exporters factor LC-backed invoices to bridge shipment-to-payment gaps on 30-60d terms (import/export is a top vertical — Crestmont); 2.25% flat over 40d ~ 1.7%/mo",
  },
  {
    key: "electronics-50d",
    issuerName: "Brightwave Circuits Co",
    payorName: "Nordic Retail Electronics AB",
    sector: "electronics manufacturing",
    faceUsdc: 54_000,
    tenorDays: 50,
    expectedBps: 225,
    grounding:
      "contract electronics manufacturers carry 30-60d OEM/retail terms and factor to fund component purchases (manufacturing is a core vertical — Riviera Finance); 2.25% over 50d ~ 1.35%/mo, low end of the band",
  },
  {
    key: "autoparts-35d",
    issuerName: "Rhein Auto Components GmbH",
    payorName: "Iberia Motor Assembly S.L.",
    sector: "auto parts manufacturing",
    faceUsdc: 41_200,
    tenorDays: 35,
    expectedBps: 225,
    grounding:
      "tier-2 auto suppliers invoice assemblers on 30-60d terms; factoring bridges tooling and material spend (manufacturing vertical — Crestmont); 2.25%/35d ~ 1.9%/mo",
  },
  {
    key: "medsupply-25d",
    issuerName: "Andean Medical Supplies S.A.C.",
    payorName: "Clinica del Valle Group",
    sector: "medical supplies distribution",
    faceUsdc: 15_800,
    tenorDays: 25,
    expectedBps: 200,
    grounding:
      "healthcare suppliers factor clinic/hospital receivables on ~30d terms (healthcare is a top vertical — Crestmont); 2.0% flat on 25d fits the band",
  },
  {
    key: "cement-28d",
    issuerName: "Sahel Trans Logistics",
    payorName: "Maghreb Cement Industries",
    sector: "freight & logistics",
    faceUsdc: 12_600,
    tenorDays: 28,
    expectedBps: 200,
    grounding:
      "regional haulage invoices are small and factored in batches on ~30d shipper terms (freight = largest vertical — DAT); 2.0% flat on 28d fits",
  },
] as const;

// --------------------------------------------------------------- constants

const E2E_DIR = fileURLToPath(new URL("..", import.meta.url));
const ROOT_DIR = join(E2E_DIR, "..", "..");
const SEED_STATE_PATH = join(E2E_DIR, "seed-state.json");
const DEMO_STATE_PATH = join(E2E_DIR, "state.json");
const API_LOG_PATH = join(E2E_DIR, "api.log");
const API_DIR = join(ROOT_DIR, "apps", "api");
const DEPLOYER_ID = "0.0.7162116";

/** Settlement gas reserve: never let the balance drop below this. */
const FLOOR_WEIBAR = 10n * 10n ** 18n;
/** Measured full pipeline: deployBond ~7M gas (~7.6 HBAR) + ~13 setup/list txs. */
const EST_NEW_BOND_WEIBAR = 11n * 10n ** 18n;
/** Bond already deployed; only compliance/mint/list txs remain. */
const EST_RESUME_WEIBAR = 4n * 10n ** 18n;

/**
 * Maturity pad past the nominal tenor so the API's FixedPlusTenor 30-day
 * bucketing quotes the same bps at listing time as at registration time.
 */
const TENOR_PAD_SECONDS = 6 * 3600;

const USDC_SCALE = 1_000_000n;

// ------------------------------------------------------------------- state

interface SeedBondState {
  invoiceUuid?: string;
  invoiceId?: `0x${string}`;
  maturity?: number;
  bondAddress?: Address;
  bondTx?: `0x${string}`;
  complianceDone?: boolean;
  listTx?: `0x${string}`;
  pricePerUnit?: string;
  attested?: boolean;
}

interface SeedState {
  topicId?: string;
  bonds: Record<string, SeedBondState>;
}

interface Seeder {
  cx: ChainCtx;
  state: SeedState;
  save: () => void;
}

// ----------------------------------------------------------------- helpers

/** Deterministic fictional EVM address for a payor name (no real key exists). */
function payorAddress(name: string): Address {
  return getAddress(`0x${keccak256(stringToHex(name)).slice(-40)}`);
}

function unitsOf(p: SeedProfile): bigint {
  return BigInt(p.faceUsdc);
}

function faceValueOf(p: SeedProfile): bigint {
  return unitsOf(p) * USDC_SCALE;
}

/** Stable per-profile document hash (also the API's duplicate guard). */
function docHashOf(p: SeedProfile, maturity: number): string {
  const due = new Date(maturity * 1000).toISOString();
  return sha256Hex(
    `sowee-seed ${p.key}: ${p.issuerName} invoices ${p.payorName} for ${p.faceUsdc} USDC (${p.sector}), due ${due}`,
  );
}

async function gateHbar(s: Seeder, bstate: SeedBondState): Promise<bigint> {
  const balance = await s.cx.pub.getBalance({ address: s.cx.account.address });
  const estimate = bstate.bondAddress ? EST_RESUME_WEIBAR : EST_NEW_BOND_WEIBAR;
  if (balance - estimate < FLOOR_WEIBAR) {
    throw new Halt(
      `HBAR floor: balance ${formatEther(balance)} HBAR minus ~${formatEther(estimate)} estimated ` +
        `for this bond would drop below the ${formatEther(FLOOR_WEIBAR)} HBAR settlement reserve.`,
    );
  }
  console.info(`  HBAR balance ${formatEther(balance)} — ok to proceed`);
  return balance;
}

// ------------------------------------------------------------------- steps

/**
 * Register (or re-register after an API restart) the invoice with the Go API
 * so the dapp can enrich the listing. Returns undefined only when the API lost
 * the invoice after it was already listed on-chain (id locked, unhealable).
 */
async function ensureInvoice(
  s: Seeder,
  p: SeedProfile,
  bstate: SeedBondState,
): Promise<ApiInvoice | undefined> {
  if (!bstate.maturity) {
    bstate.maturity = nowSeconds() + p.tenorDays * 86_400 + TENOR_PAD_SECONDS;
    s.save();
  }
  if (bstate.invoiceUuid) {
    try {
      return await getJson<ApiInvoice>(`/invoices/${bstate.invoiceUuid}`);
    } catch {
      if (bstate.listTx) {
        console.warn(
          "  API restarted after this invoice was listed; on-chain listing stands but API enrichment is gone",
        );
        return undefined;
      }
      console.warn("  API lost the invoice (restart); re-registering with the same maturity");
    }
  }
  const invoice = await postJson<ApiInvoice>("/invoices", {
    payor: payorAddress(p.payorName),
    faceValue: faceValueOf(p).toString(),
    dueDate: new Date(bstate.maturity * 1000).toISOString(),
    docHash: docHashOf(p, bstate.maturity),
  });
  bstate.invoiceUuid = invoice.id;
  bstate.invoiceId = invoice.invoiceId;
  s.save();
  console.info(`  ok invoice registered with API: ${invoice.id}`);
  console.info(`     invoiceId ${invoice.invoiceId} — payor ${invoice.payor} (fictional)`);
  return invoice;
}

async function ensureBond(s: Seeder, p: SeedProfile, bstate: SeedBondState): Promise<Address> {
  if (bstate.bondAddress) {
    console.info(`  ok bond already issued at ${bstate.bondAddress}`);
    return bstate.bondAddress;
  }
  const invoiceId = needField(bstate.invoiceId, "invoiceId", p.key);
  const maturity = needField(bstate.maturity, "maturity", p.key);
  // No `isin` passed: the plugin derives a checksum-valid ISIN from the invoiceId.
  const call = buildCreateInvoiceBondCall({
    invoiceId,
    faceValue: faceValueOf(p),
    maturityDate: BigInt(maturity),
    admin: s.cx.account.address,
  });
  bstate.bondTx = await send(s.cx, `deployBond via ATS factory (${p.issuerName})`, call);
  s.save();
  bstate.bondAddress = await fetchDeployedBond(s.cx, bstate.bondTx);
  s.save();
  console.info(`  ok bond diamond at ${bstate.bondAddress}`);
  console.info(`     ${contractLink(bstate.bondAddress)}`);
  return bstate.bondAddress;
}

async function ensureCompliance(
  s: Seeder,
  p: SeedProfile,
  bstate: SeedBondState,
  bond: Address,
): Promise<void> {
  if (bstate.complianceDone) {
    console.info("  ok compliance already bootstrapped");
    return;
  }
  await ensureRoles(s.cx, bond);
  await ensureSsiIssuer(s.cx, bond);
  await ensureParticipantCompliance(s.cx, bond);
  await ensureUnitsIssued(s.cx, bond, unitsOf(p));
  bstate.complianceDone = true;
  s.save();
}

async function ensureListed(
  s: Seeder,
  p: SeedProfile,
  bstate: SeedBondState,
  bond: Address,
): Promise<void> {
  if (bstate.listTx) {
    console.info("  ok invoice already listed");
    return;
  }
  const uuid = needField(bstate.invoiceUuid, "invoiceUuid", p.key);
  const invoiceId = needField(bstate.invoiceId, "invoiceId", p.key);
  const maturity = needField(bstate.maturity, "maturity", p.key);
  const quote = await postJson<ApiQuote>(`/invoices/${uuid}/quote`, {});
  const bpsNote =
    quote.discountRateBps === p.expectedBps
      ? "as expected"
      : `expected ${p.expectedBps} — tenor bucket drifted`;
  console.info(
    `  ok signed quote: ${quote.discountRateBps} bps (${bpsNote}) on ${formatUsdc(BigInt(quote.faceValue))} USDC (nonce ${quote.nonce})`,
  );
  const units = unitsOf(p);
  const pricePerUnit = await listInvoiceLeg(
    s.cx,
    { bond, invoiceId, units, maturity, quote },
    (tx) => {
      bstate.listTx = tx;
      s.save();
    },
  );
  bstate.pricePerUnit = pricePerUnit.toString();
  s.save();
  console.info(`  primary price: ${formatUsdc(pricePerUnit)} USDC per unit`);
}

async function ensureAttested(s: Seeder, p: SeedProfile, bstate: SeedBondState): Promise<void> {
  if (bstate.attested) {
    console.info('  ok "issued" already attested');
    return;
  }
  const uuid = needField(bstate.invoiceUuid, "invoiceUuid", p.key);
  const res = await postJson<ApiAttestResult>(`/invoices/${uuid}/attest`, { event: "issued" });
  if (res.mode !== "submitted" || !res.topicId) {
    throw new Error(`attest "issued" not submitted to HCS (mode=${res.mode})`);
  }
  s.state.topicId = res.topicId;
  bstate.attested = true;
  s.save();
  console.info(`  ok attested "issued" (topic ${res.topicId}, seq ${res.sequenceNumber})`);
  console.info(`     ${topicLink(res.topicId)}`);
}

function needField<T>(value: T | undefined, name: string, key: string): T {
  if (value === undefined) {
    throw new Error(`seed-state.${key}.${name} missing — delete its entry and re-run`);
  }
  return value;
}

// -------------------------------------------------------------------- main

async function seedOne(s: Seeder, p: SeedProfile, bstate: SeedBondState): Promise<void> {
  if (bstate.listTx && bstate.attested) {
    console.info(`  ok fully seeded — bond ${bstate.bondAddress}`);
    return;
  }
  await gateHbar(s, bstate);
  const invoice = await ensureInvoice(s, p, bstate);
  const bond = await ensureBond(s, p, bstate);
  await ensureCompliance(s, p, bstate, bond);
  if (!invoice && !bstate.listTx) {
    throw new Error(`invoice ${p.key} unavailable from API before listing — cannot continue`);
  }
  await ensureListed(s, p, bstate, bond);
  if (invoice) {
    await ensureAttested(s, p, bstate);
  }
}

async function ensureApiUp(s: Seeder): Promise<void> {
  if (await isHealthy()) {
    console.info("  ok Go API already healthy");
    return;
  }
  await startApi({
    apiDir: API_DIR,
    logPath: API_LOG_PATH,
    operatorId: DEPLOYER_ID,
    walletKey: s.cx.walletPk,
    topicId: s.state.topicId,
    onTopicId: (topicId) => {
      s.state.topicId = topicId;
      s.save();
    },
  });
  console.info("  ok Go API healthy (spawned; logs in scripts/e2e/api.log)");
}

function summarize(s: Seeder, startBalance: bigint, endBalance: bigint, halted?: string): void {
  console.info("\n=== seed summary");
  let listed = 0;
  for (const p of PROFILES) {
    const b = s.state.bonds[p.key];
    if (b?.listTx) {
      listed++;
      console.info(`  ${p.key}: LISTED — ${p.issuerName}, ${p.faceUsdc.toLocaleString()} USDC`);
      console.info(`     bond    ${contractLink(b.bondAddress ?? "?")}`);
      console.info(`     list tx ${b.listTx}`);
    } else {
      console.info(`  ${p.key}: not seeded — ${p.issuerName}`);
    }
  }
  console.info(`  ${listed}/${PROFILES.length} invoices listed on InvoiceMarket`);
  console.info(
    `  HBAR: ${formatEther(startBalance)} -> ${formatEther(endBalance)} (spent ${formatEther(startBalance - endBalance)})`,
  );
  if (s.state.topicId) {
    console.info(`  HCS audit trail: ${topicLink(s.state.topicId)}`);
  }
  if (halted) {
    console.info(`  stopped early: ${halted}`);
  }
}

async function main(): Promise<void> {
  const cx = createChainCtx(readWalletPk(ROOT_DIR));
  const loaded = loadState<SeedState>(SEED_STATE_PATH);
  const state: SeedState = { ...loaded, bonds: loaded.bonds ?? {} };
  if (!state.topicId) {
    // Share the demo's HCS topic so every attestation lands where the dapp reads.
    const demoTopic = loadState<DemoState>(DEMO_STATE_PATH).topicId;
    if (demoTopic) {
      state.topicId = demoTopic;
    }
  }
  const s: Seeder = { cx, state, save: () => saveState(SEED_STATE_PATH, state) };
  s.save();

  console.info(
    `Sowee market seeder on Hedera testnet — wallet ${cx.account.address} (${DEPLOYER_ID})`,
  );
  console.info(`Dataset: ${PROFILES.length} invoice profiles (fictional issuers/payors)`);
  console.info("\n=== api-up");
  await ensureApiUp(s);

  const startBalance = await cx.pub.getBalance({ address: cx.account.address });
  let halted: string | undefined;
  for (const p of PROFILES) {
    console.info(`\n=== ${p.key}: ${p.issuerName} -> ${p.payorName}`);
    console.info(
      `    ${p.sector} | ${p.tenorDays}d tenor | ${p.faceUsdc.toLocaleString()} USDC face | ~${p.expectedBps} bps`,
    );
    console.info(`    grounding: ${p.grounding}`);
    let bstate = state.bonds[p.key];
    if (!bstate) {
      bstate = {};
      state.bonds[p.key] = bstate;
    }
    try {
      await seedOne(s, p, bstate);
    } catch (err) {
      if (err instanceof Halt) {
        halted = err.message;
        break;
      }
      throw err;
    }
  }
  const endBalance = await cx.pub.getBalance({ address: cx.account.address });
  summarize(s, startBalance, endBalance, halted);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(`\nseed failed: ${shortError(err)}`);
  console.error(err);
  process.exit(1);
});
