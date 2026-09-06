import type { Metadata } from "next"
import Link from "next/link"
import { Doc, H2, List, lastUpdated } from "../doc"

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "How the Sowee demonstration may be used: what the software does, what you tell us when you use it, and the risks you accept.",
}

export default function TermsOfServicePage() {
  return (
    <Doc title="Terms of Service" updated={lastUpdated}>
      <p>
        These terms describe how the Sowee demonstration may be used. Read them with the{" "}
        <Link href="/legal/disclaimers" className="underline">
          Disclaimers
        </Link>
        , which explain what this project is not.
      </p>

      <H2>1. What Sowee is</H2>
      <p>
        Sowee is a demonstration built for the ETHOnline 2026 hackathon, between 4 and 13 September
        2026. It runs on Hedera testnet (chain 296) and Arc testnet (chain 5042002) with test-value
        assets. There is no company behind it and no registration with any regulator.
      </p>

      <H2>2. What the service actually does</H2>
      <p>
        Sowee is software and a web interface. It reads public chain state, prices an invoice and
        signs a discount quote, orchestrates an identity check, and helps your wallet build
        transactions. Your wallet signs them and you send them.
      </p>
      <p>
        Sowee never holds your keys. It never takes custody of any asset. It cannot move anything
        out of your wallet, cannot sign on your behalf, and cannot reverse, cancel or refund a
        transaction once the network has accepted it. The only thing the project writes on your
        behalf is your eligibility flag on a bond contract, after the identity check.
      </p>

      <H2>3. Who may use it</H2>
      <p>By using this site you tell us that:</p>
      <List>
        <li>you are at least 18 years old;</li>
        <li>
          you are not a person or entity on any sanctions list, and you are not acting for or on
          behalf of one;
        </li>
        <li>
          you are not resident in a comprehensively sanctioned jurisdiction — currently Iran, North
          Korea, Cuba and Syria in our policy;
        </li>
        <li>
          you will not use a VPN, a proxy, another person&apos;s identity documents or a false
          answer to get past any check on this site;
        </li>
        <li>using this site is lawful where you are.</li>
      </List>
      <p>
        If any of that stops being true, stop using the site. We do not verify these statements
        beyond the checks described below, so they rest on you.
      </p>

      <H2>4. The identity check</H2>
      <p>
        Investing requires identity verification. It runs in the Sumsub sandbox: an identity
        document and a liveness selfie go to Sumsub, and you answer a suitability questionnaire. A
        fail-closed policy then decides. A self-declared US person is blocked, a resident of a
        comprehensively sanctioned jurisdiction is blocked, a politically exposed person is held for
        review, and a missing answer is held. Only a boolean eligibility flag per wallet address
        reaches the chain.
      </p>
      <p>
        Your declarations are enforced, not decorative. They determine your on-chain eligibility. A
        false declaration voids it. Declarations become immutable once a review has completed, and a
        wallet that was granted eligibility and later evaluates to blocked is revoked on chain. What
        happens to your data is set out in the{" "}
        <Link href="/legal/privacy-policy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>

      <H2>5. What you may not do</H2>
      <List>
        <li>
          Circumvent, or try to circumvent, the identity check, the allowlist or the rate limits.
        </li>
        <li>Use someone else&apos;s wallet, identity or documents.</li>
        <li>Submit an invoice, a document hash or a reference you have no right to submit.</li>
        <li>Attack, overload or probe the API or the interface, or automate them abusively.</li>
        <li>
          Present this demonstration to anyone as a real offering, a real yield, or a service backed
          by a real company.
        </li>
        <li>Use the site for anything unlawful where you are.</li>
      </List>

      <H2>6. Risks you accept</H2>
      <List>
        <li>
          <span className="text-ink">Test networks are unstable.</span> Hedera testnet and Arc
          testnet can be reset, congested or unavailable. State can vanish.
        </li>
        <li>
          <span className="text-ink">Keys are yours alone.</span> Lose your private key or seed
          phrase and nobody — including us — can recover it or anything it controls.
        </li>
        <li>
          <span className="text-ink">The contracts are unaudited.</span> They were written inside a
          hackathon window and carry the usual risk of bugs and unexpected behaviour.
        </li>
        <li>
          <span className="text-ink">Records are public and permanent.</span> Chain transactions and
          messages on the audit topic cannot be edited or deleted by anyone.
        </li>
        <li>
          <span className="text-ink">The demo may end.</span> It may be reset, redeployed or taken
          offline at any moment, without notice. Off-chain state, including your verification
          decision, is held in memory and is lost on every restart.
        </li>
        <li>
          <span className="text-ink">Third parties can fail.</span> Sumsub, World, the x402
          facilitator, the RPC endpoints and your wallet extension are outside our control.
        </li>
      </List>

      <H2>7. No warranties</H2>
      <p>
        The site, the contracts and the API are provided as they are, with no warranty of any kind.
        We do not promise that they are correct, secure, available, fit for any purpose, or free of
        bugs. We do not promise that a quote will be honoured, that a transaction will confirm, that
        a verification will complete, or that anything you see today will exist tomorrow.
      </p>

      <H2>8. Limitation of liability</H2>
      <p>
        To the fullest extent the law allows, nobody who built or runs this demonstration is liable
        for any loss or damage arising from your use of it — including lost keys, failed or stuck
        transactions, contract bugs, third-party outages, or anything published permanently on a
        public ledger. Since the assets involved have no monetary value, there is no financial loss
        this site can cause; that is the point of running it on test networks.
      </p>

      <H2>9. Changes</H2>
      <p>
        These terms can change as the project changes. The date at the top moves when they do, and
        every revision is visible in the public git history at{" "}
        <a
          className="underline"
          href="https://github.com/sowee-finance/sowee"
          target="_blank"
          rel="noreferrer"
        >
          github.com/sowee-finance/sowee
        </a>
        . Continuing to use the site after a change means you accept the current version.
      </p>

      <H2>10. No contract, and no governing law we could honestly name</H2>
      <p>
        A real service would name a company, a governing law and a place to bring a dispute. We have
        none of those. There is no legal entity to contract with, no place of business and nobody
        holding anything of yours, so using this site creates no contractual relationship and no
        commitment to provide a service. Naming a jurisdiction or an arbitration clause here would
        be inventing a counterparty that does not exist.
      </p>
      <p>
        So treat this document as what it is: a plain description of how the demonstration is meant
        to be used, and of the risks of using it. Where the law where you live gives you rights,
        that law applies whatever this page says.
      </p>

      <H2>11. Contact</H2>
      <p>
        Anything about these terms:{" "}
        <a className="underline" href="mailto:support@sowee.site">
          support@sowee.site
        </a>
        .
      </p>
    </Doc>
  )
}
