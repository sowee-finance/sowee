import type { Metadata } from "next"
import Link from "next/link"
import { Doc, H2, List, lastUpdated } from "../doc"

export const metadata: Metadata = {
  title: "Disclaimers",
  description:
    "Sowee is a hackathon demonstration on test networks: no entity, no registration, no offer, no advice, no real money.",
}

export default function DisclaimersPage() {
  return (
    <Doc title="Disclaimers" updated={lastUpdated}>
      <p>
        Read this before anything else on the site. Sowee looks like an investment product on
        purpose — that is what it demonstrates — and everything below explains why it is not one.
      </p>

      <H2>There is no company here</H2>
      <p>
        Sowee is a demonstration built for the ETHOnline 2026 hackathon, between 4 and 13 September
        2026. It is a software project, not a business. There is no legal entity behind it. It is
        not registered with any regulator anywhere, holds no licence, and is not a broker, a dealer,
        an adviser, a custodian, an exchange or a fund. No regulator has reviewed, approved or
        endorsed any part of it.
      </p>

      <H2>Nothing here is an offer</H2>
      <p>
        Nothing on this site is an offer to sell, or a solicitation of an offer to buy, any security
        or any other financial instrument. Nothing here has been registered under the securities law
        of any country. There is no prospectus, no offering document and no exemption being relied
        on, because nothing is actually being offered.
      </p>

      <H2>The assets are test-value</H2>
      <p>
        Sowee runs on Hedera testnet (chain 296) and Arc testnet (chain 5042002). The USDC and HBAR
        it moves are testnet tokens. They are handed out for free by public faucets, they cannot be
        bought or sold, and they have no monetary value. Every transaction you sign here is a real,
        permanent record on a public test ledger, and it settles nothing of value.
      </p>

      <H2>The Regulation S posture is a demonstration</H2>
      <p>
        The onboarding flow runs a fail-closed suitability policy: a self-declared US person is
        blocked, a resident of a comprehensively sanctioned jurisdiction is blocked, a politically
        exposed person is held for review, and a missing answer is held. Some invoices are also
        issued as an ERC-1400 security through Hedera&apos;s Asset Tokenization Studio, with a{" "}
        <code className="text-ink">Reg S</code> regulation type recorded on chain.
      </p>
      <p>
        That is a demonstration of what a compliance layer looks like when it is wired to a token,
        not a real offering restriction and not legal advice. Do not read the outcome of our policy
        as a statement about your status under any real law, in either direction.
      </p>

      <H2>Implied yields are arithmetic, not promises</H2>
      <p>
        A bond page shows an implied APY. It is a calculation: the discount between the price and
        the face value, spread over the days left to maturity and annualised. It assumes the payor
        repays in full and on time. It is not a forecast, a target or a promise of return, and it
        does not account for default, delay or fees.
      </p>
      <p>
        The price line on a bond page is the synthetic accretion of the discounted price towards
        par. There is no price history on chain and no trading history behind that curve. Nothing on
        this site is past performance, and past performance would say nothing about the future
        anyway.
      </p>

      <H2>In a real version of this, you could lose everything</H2>
      <p>
        Invoice financing carries real risk. A payor may pay late, pay part, or never pay. Nothing
        insures, guarantees or protects the amount put into an invoice-backed bond, and total loss
        is possible. Here that risk costs you nothing because the money is not real. Anywhere else,
        it would.
      </p>

      <H2>No advice of any kind</H2>
      <p>
        Nothing on this site or in this repository is investment, legal, tax, accounting or
        financial advice, or a recommendation to enter into any transaction. No part of it is
        tailored to your circumstances, and nobody here is qualified to tailor it. If you are
        thinking about anything similar with real money, talk to someone who is.
      </p>

      <H2>Third-party services are named, not endorsed</H2>
      <p>Sowee calls services it does not control:</p>
      <List>
        <li>Sumsub, for identity verification, in its sandbox environment.</li>
        <li>World, for the Selfie Check anti-sybil signal.</li>
        <li>The Blocky402 facilitator, which verifies and settles x402 payments.</li>
        <li>Hedera, its mirror nodes and HashScan; Arc and Arcscan.</li>
        <li>Whatever browser wallet extension you connect.</li>
      </List>
      <p>
        Naming them is a description of how the code works, not an endorsement, a partnership claim
        or a statement about their quality. Each has its own terms and its own privacy policy, and
        those apply to you when you use them. We are not responsible for what they do or fail to do.
      </p>

      <H2>This demo can change or disappear</H2>
      <p>
        Contracts may be redeployed, the database of decisions lives in memory and is cleared on
        every restart, and the whole thing may be reset or taken offline at any time without notice.
        Do not rely on anything here staying where it is.
      </p>

      <p className="pt-4">
        See also the{" "}
        <Link href="/legal/terms-of-service" className="underline">
          Terms of Service
        </Link>
        , the{" "}
        <Link href="/legal/privacy-policy" className="underline">
          Privacy Policy
        </Link>{" "}
        and the{" "}
        <Link href="/legal/cookies-policy" className="underline">
          Cookies Policy
        </Link>
        .
      </p>
    </Doc>
  )
}
