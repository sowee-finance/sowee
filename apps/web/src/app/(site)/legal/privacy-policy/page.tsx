import type { Metadata } from "next"
import Link from "next/link"
import { Doc, H2, List, lastUpdated } from "../doc"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Sowee collects, who it reaches, what never touches the chain, and which records can never be deleted by anyone.",
}

export default function PrivacyPolicyPage() {
  return (
    <Doc title="Privacy Policy" updated={lastUpdated}>
      <p>
        Sowee is a hackathon demonstration on test networks, but the identity check handles real
        personal data about you. This page describes what actually happens to it, based on the code
        in the public repository rather than on what a policy usually says.
      </p>

      <H2>Read this part first: some records can never be deleted</H2>
      <p>
        Two things Sowee writes are public and permanent. Nobody can edit, correct or delete them —
        not you, not us, not the network operators.
      </p>
      <List>
        <li>
          <span className="text-ink">The public ledger.</span> Every transaction you sign is stored
          for good on Hedera testnet or Arc testnet, under your wallet address: listings you open,
          bonds you fund, asks you post and fill, claims you make, and the eligibility flag that the
          identity check sets on your wallet.
        </li>
        <li>
          <span className="text-ink">The audit topic.</span> Sowee anchors its audit trail to a
          public Hedera Consensus Service topic that anyone can read. It carries invoice references,
          the sha256 of an invoice document, the lifecycle event, and receipts for x402 payments
          (the endpoint, the payer&apos;s Hedera account id, the amount and the settlement
          transaction).
        </li>
      </List>
      <p>
        Nothing you submit through the identity check is written to either place. But treat every
        invoice reference and every wallet address you use here as published forever, because it is.
        If you would not want something public and permanent, do not put it into this demonstration.
      </p>

      <H2>What is collected, and why</H2>
      <List>
        <li>
          <span className="text-ink">Your wallet address.</span> It is the identifier for everything
          — your eligibility decision, your holdings, your rate limit. You give it by connecting a
          wallet, and you prove it by signing a short challenge message.
        </li>
        <li>
          <span className="text-ink">Identity data, through Sumsub.</span> Your first and last name,
          date of birth, country of residence, an identity document and a liveness selfie. The
          document and the selfie are captured inside Sumsub&apos;s own widget and go to Sumsub, not
          to us.
        </li>
        <li>
          <span className="text-ink">Your questionnaire answers.</span> The suitability declarations
          — residence, US person status, sanctions, investor classification, experience, source of
          funds, politically exposed person, beneficial owner. The policy needs them to decide.
        </li>
        <li>
          <span className="text-ink">A World nullifier</span>, if the Selfie Check step is enabled.
          It is a pseudonym for a World ID, scoped to our action, so that one World ID cannot pass
          the anti-sybil check twice. It is not an identity document, it does not name you, and it
          is not a substitute for the identity check.
        </li>
        <li>
          <span className="text-ink">Request metadata.</span> Ordinary server traffic: IP address,
          path, timestamp. It is used to rate-limit the API and to spot abuse. Paid API calls are
          metered per payer Hedera account id.
        </li>
      </List>

      <H2>Where it goes</H2>
      <List>
        <li>
          <span className="text-ink">Sumsub</span> receives your name, date of birth, country,
          identity document and liveness selfie, filed under your wallet address as the applicant
          reference. This runs in Sumsub&apos;s sandbox environment. Sowee&apos;s API reads back
          only the review result, the reason, your questionnaire answers and the applicant id —
          never the document or the selfie. Sumsub handles what it holds under its own privacy
          policy.
        </li>
        <li>
          <span className="text-ink">World&apos;s Developer Portal</span> receives the Selfie Check
          proof from your browser through our API and returns the nullifier. World handles it under
          its own privacy policy.
        </li>
        <li>
          <span className="text-ink">The public audit topic and the public ledger</span> receive
          what is listed above: invoice references, document hashes, lifecycle events, x402 receipts
          and your eligibility flag.
        </li>
      </List>
      <p>
        Nothing is sold, and nothing goes to an advertiser or a data broker. There is no analytics
        service on this site and no advertising tracker.
      </p>

      <H2>What is kept, where, and for how long</H2>
      <List>
        <li>
          <span className="text-ink">In the API&apos;s memory, until it restarts.</span> Your
          verification state (<code className="text-ink">none</code>,{" "}
          <code className="text-ink">pending</code>, <code className="text-ink">held</code>,{" "}
          <code className="text-ink">blocked</code>, <code className="text-ink">granting</code>,{" "}
          <code className="text-ink">granted</code>), the reason for it, your Sumsub applicant id,
          the grant transactions, the Selfie Check flag and the used nullifiers, and the rate-limit
          and metering counters. There is no database. A restart erases all of it, and restarts are
          frequent in a demonstration.
        </li>
        <li>
          <span className="text-ink">With Sumsub, for as long as Sumsub keeps it.</span> Your
          applicant file lives in their sandbox tenant under their retention policy, not ours.
        </li>
        <li>
          <span className="text-ink">On the topic and the ledger, forever.</span> See the first
          section.
        </li>
      </List>

      <H2>What never reaches the chain</H2>
      <p>
        No name, no date of birth, no country, no document, no image, and no hash of any of them.
        The chain holds one boolean per wallet address on each bond: eligible, or not. The reason
        for a decision stays off chain.
      </p>
      <p>
        An invoice document attached in the issuer form is hashed in your browser with the Web
        Crypto API and never uploaded. Only its sha256 is anchored to the audit topic, and a hash
        cannot be turned back into the document — though anyone holding the same file can prove it
        matches.
      </p>

      <H2>Cross-border processing</H2>
      <p>
        Sumsub and World are independent providers who process data on their own infrastructure, in
        countries we do not choose and cannot tell you in advance. Public ledger and topic data is
        replicated worldwide by anyone running or reading a node. If that is not acceptable to you,
        do not complete the identity check.
      </p>

      <H2>Asking about your data, and deleting it</H2>
      <p>
        Write to{" "}
        <a className="underline" href="mailto:support@sowee.site">
          support@sowee.site
        </a>{" "}
        and say which wallet address you are asking about.
      </p>
      <List>
        <li>
          <span className="text-ink">Off-chain state we hold</span> can be cleared on request. In
          practice it clears itself: it only lives in the running process.
        </li>
        <li>
          <span className="text-ink">Your Sumsub applicant file</span> is held by Sumsub. We can ask
          them to delete it on your behalf, and you can contact them directly.
        </li>
        <li>
          <span className="text-ink">On-chain records and topic messages cannot be deleted.</span>{" "}
          Not on request, not by us, not by anyone. There is no mechanism for it and we will not
          pretend otherwise.
        </li>
      </List>
      <p>
        You can also stop at any point. Disconnecting your wallet, or never starting the identity
        check, leaves us with nothing about you but ordinary request logs.
      </p>

      <H2>Children</H2>
      <p>
        This demonstration is not for anyone under 18, and we do not knowingly collect anything from
        a child.
      </p>

      <H2>Changes</H2>
      <p>
        This policy changes when the project does, and the date at the top moves with it. Every
        revision is in the public git history.
      </p>

      <p className="pt-4">
        What the site stores in your own browser is covered separately in the{" "}
        <Link href="/legal/cookies-policy" className="underline">
          Cookies Policy
        </Link>
        .
      </p>
    </Doc>
  )
}
