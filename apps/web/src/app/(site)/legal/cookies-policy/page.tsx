import type { Metadata } from "next"
import Link from "next/link"
import { Doc, H2, List, lastUpdated } from "../doc"

export const metadata: Metadata = {
  title: "Cookies Policy",
  description:
    "Sowee sets no cookies. What it does store in your browser is the wallet connection, kept locally on your device.",
}

export default function CookiesPolicyPage() {
  return (
    <Doc title="Cookies Policy" updated={lastUpdated}>
      <p>
        Sowee sets no cookies of its own. There is no analytics service, no advertising tag, no
        tracking pixel and no third-party script that follows you between sites. This page describes
        the small amount the site does keep in your browser, and what the identity step brings with
        it.
      </p>

      <H2>What Sowee stores on your device</H2>
      <p>
        One thing, and only after you connect a wallet. The wallet library the app uses (wagmi)
        writes a couple of entries to <code className="text-ink">localStorage</code> —{" "}
        <code className="text-ink">wagmi.store</code> and{" "}
        <code className="text-ink">wagmi.recentConnectorId</code> — recording which browser wallet
        you connected and which chain you were on, so that a page reload does not drop the
        connection.
      </p>
      <p>
        That entry is first-party, stays on your device, is never sent to our servers and is never
        read by anyone else. It holds no personal data — a connector name, a chain id and your
        wallet address, which is public anyway.
      </p>

      <H2>What Sowee does not store</H2>
      <List>
        <li>
          No cookies at all. The site sets no <code className="text-ink">Set-Cookie</code> header
          and writes no <code className="text-ink">document.cookie</code>.
        </li>
        <li>
          No session identifier. The API authenticates a request by a signature from your wallet
          that you send with it, not by a session held in your browser.
        </li>
        <li>
          Nothing about the identity check. Your name, documents and answers are never written into
          browser storage by this site.
        </li>
        <li>
          Fonts are served from this site, not fetched from a font CDN, so loading a page contacts
          no third party.
        </li>
      </List>

      <H2>The identity step loads a third-party widget</H2>
      <p>
        When you reach the identity step of the onboarding wizard, the page loads the Sumsub WebSDK
        script from <code className="text-ink">static.sumsub.com</code>, and that script mounts an
        iframe served from Sumsub. Anything Sumsub stores inside its own frame — cookies or
        otherwise — is set by Sumsub, under Sumsub&apos;s policy. We do not control it, cannot read
        it and cannot clear it for you. It only loads if you open that step.
      </p>
      <p>
        The World Selfie Check step, when it is enabled, uses World&apos;s IDKit. As of this
        revision IDKit writes nothing to browser storage, and the step is not yet exercised end to
        end because access to the feature is still pending from World.
      </p>

      <H2>What you can do about it</H2>
      <List>
        <li>
          Clearing site data in your browser removes the wallet entry. The only effect is that the
          site forgets which wallet you had connected, and you reconnect on the next visit.
        </li>
        <li>
          Blocking third-party storage or scripts is fine for the rest of the site, but the identity
          step will not work without Sumsub&apos;s widget.
        </li>
        <li>
          Your wallet extension keeps its own storage under its own policy, which nothing here can
          change.
        </li>
      </List>

      <H2>Why there is no cookie banner</H2>
      <p>
        A consent banner asks permission for storage that is not needed to run the site. There is
        none here: no cookies at all, and one local entry that exists only because you connected a
        wallet. If that ever changes, this page changes before the code ships.
      </p>

      <p className="pt-4">
        What happens to data that leaves your browser is covered in the{" "}
        <Link href="/legal/privacy-policy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </Doc>
  )
}
