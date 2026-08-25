// AssemblyScript mappings for all three Sowee data sources (one shared file).

import { BigInt, ByteArray, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { QuoteConsumed as QuoteConsumedEvent } from "../generated/DiscountOracle/DiscountOracle";
import {
  AskCancelled as AskCancelledEvent,
  AskCreated as AskCreatedEvent,
  AskFilled as AskFilledEvent,
  InvoiceListed as InvoiceListedEvent,
  ListingCancelled as ListingCancelledEvent,
  PrimaryPurchase as PrimaryPurchaseEvent,
} from "../generated/InvoiceMarket/InvoiceMarket";
import {
  Claimed as ClaimedEvent,
  InvoiceRegistered as InvoiceRegisteredEvent,
  RepaymentDeposited as RepaymentDepositedEvent,
  Settled as SettledEvent,
  SettlementScheduled as SettlementScheduledEvent,
} from "../generated/MaturitySettlement/MaturitySettlement";
import {
  Ask,
  AskCancel,
  AskFill,
  Claim,
  Invoice,
  PrimaryPurchase,
  Quote,
  Settlement,
} from "../generated/schema";

function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

function askKey(askId: BigInt): Bytes {
  return Bytes.fromByteArray(ByteArray.fromBigInt(askId));
}

// ------------------------------------------------------------ InvoiceMarket

export function handleInvoiceListed(event: InvoiceListedEvent): void {
  const invoice = new Invoice(event.params.invoiceId);
  invoice.issuer = event.params.issuer;
  invoice.bond = event.params.bond;
  invoice.totalUnits = event.params.totalUnits;
  invoice.unitsRemaining = event.params.totalUnits;
  invoice.pricePerUnit = event.params.pricePerUnit;
  invoice.maturity = event.params.maturity;
  invoice.cancelled = false;
  invoice.listedAt = event.block.timestamp;
  invoice.listedTx = event.transaction.hash;
  // QuoteConsumed fires earlier in the same tx; the Quote row shares this id.
  invoice.quote = event.params.invoiceId;
  invoice.save();
}

export function handlePrimaryPurchase(event: PrimaryPurchaseEvent): void {
  const purchase = new PrimaryPurchase(eventId(event));
  purchase.invoice = event.params.invoiceId;
  purchase.buyer = event.params.buyer;
  purchase.units = event.params.units;
  purchase.cost = event.params.cost;
  purchase.fee = event.params.fee;
  purchase.timestamp = event.block.timestamp;
  purchase.txHash = event.transaction.hash;
  purchase.save();

  const invoice = Invoice.load(event.params.invoiceId);
  if (invoice != null) {
    invoice.unitsRemaining = invoice.unitsRemaining.minus(event.params.units);
    invoice.save();
  }
}

export function handleListingCancelled(event: ListingCancelledEvent): void {
  const invoice = Invoice.load(event.params.invoiceId);
  if (invoice != null) {
    invoice.cancelled = true;
    invoice.unitsRemaining = invoice.unitsRemaining.minus(event.params.unitsReturned);
    invoice.save();
  }
}

export function handleAskCreated(event: AskCreatedEvent): void {
  const ask = new Ask(askKey(event.params.askId));
  ask.askId = event.params.askId;
  ask.invoice = event.params.invoiceId;
  ask.seller = event.params.seller;
  ask.units = event.params.units;
  ask.unitsRemaining = event.params.units;
  ask.pricePerUnit = event.params.pricePerUnit;
  ask.cancelled = false;
  ask.createdAt = event.block.timestamp;
  ask.save();
}

export function handleAskFilled(event: AskFilledEvent): void {
  const ask = Ask.load(askKey(event.params.askId));
  if (ask == null) {
    return;
  }
  const fill = new AskFill(eventId(event));
  fill.ask = ask.id;
  fill.buyer = event.params.buyer;
  fill.units = event.params.units;
  fill.cost = event.params.cost;
  fill.fee = event.params.fee;
  fill.timestamp = event.block.timestamp;
  fill.txHash = event.transaction.hash;
  fill.save();

  ask.unitsRemaining = ask.unitsRemaining.minus(event.params.units);
  ask.save();
}

export function handleAskCancelled(event: AskCancelledEvent): void {
  const ask = Ask.load(askKey(event.params.askId));
  if (ask == null) {
    return;
  }
  const cancel = new AskCancel(eventId(event));
  cancel.ask = ask.id;
  cancel.unitsReturned = event.params.unitsReturned;
  cancel.timestamp = event.block.timestamp;
  cancel.txHash = event.transaction.hash;
  cancel.save();

  ask.cancelled = true;
  ask.unitsRemaining = ask.unitsRemaining.minus(event.params.unitsReturned);
  ask.save();
}

// ----------------------------------------------------------- DiscountOracle

export function handleQuoteConsumed(event: QuoteConsumedEvent): void {
  // id = invoiceId: the latest consumed quote per invoice wins.
  const quote = new Quote(event.params.invoiceId);
  quote.invoice = event.params.invoiceId;
  quote.nonce = event.params.nonce;
  quote.faceValue = event.params.faceValue;
  quote.discountRateBps = event.params.discountRateBps;
  quote.consumedAt = event.block.timestamp;
  quote.txHash = event.transaction.hash;
  quote.save();
}

// ------------------------------------------------------- MaturitySettlement

export function handleInvoiceRegistered(event: InvoiceRegisteredEvent): void {
  const settlement = new Settlement(event.params.invoiceId);
  settlement.invoice = event.params.invoiceId;
  settlement.bond = event.params.bond;
  settlement.maturity = event.params.maturity;
  settlement.totalRepayment = BigInt.zero();
  settlement.settled = false;
  settlement.repayment = BigInt.zero();
  settlement.supplySnapshot = BigInt.zero();
  settlement.save();

  const invoice = Invoice.load(event.params.invoiceId);
  if (invoice != null) {
    invoice.settlement = settlement.id;
    invoice.save();
  }
}

export function handleRepaymentDeposited(event: RepaymentDepositedEvent): void {
  const settlement = Settlement.load(event.params.invoiceId);
  if (settlement != null) {
    settlement.totalRepayment = event.params.totalRepayment;
    settlement.save();
  }
}

export function handleSettlementScheduled(event: SettlementScheduledEvent): void {
  const settlement = Settlement.load(event.params.invoiceId);
  if (settlement != null) {
    settlement.scheduleAddress = event.params.scheduleAddress;
    settlement.scheduleExpiry = event.params.expirySecond;
    settlement.save();
  }
}

export function handleSettled(event: SettledEvent): void {
  const settlement = Settlement.load(event.params.invoiceId);
  if (settlement != null) {
    settlement.settled = true;
    settlement.repayment = event.params.repayment;
    settlement.supplySnapshot = event.params.supplySnapshot;
    settlement.settledAt = event.block.timestamp;
    settlement.save();
  }
}

export function handleClaimed(event: ClaimedEvent): void {
  const claim = new Claim(eventId(event));
  claim.settlement = event.params.invoiceId;
  claim.holder = event.params.holder;
  claim.units = event.params.units;
  claim.payout = event.params.payout;
  claim.timestamp = event.block.timestamp;
  claim.txHash = event.transaction.hash;
  claim.save();
}
