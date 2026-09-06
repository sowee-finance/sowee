import type { Metadata } from "next"
import Link from "next/link"
import { lastUpdated } from "./doc"

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Disclaimers, terms of service, privacy policy and cookies policy for the Sowee demonstration.",
}

const documents = [
  {
    href: "/legal/disclaimers",
    title: "Disclaimers",
    blurb: "What Sowee is not: no entity, no registration, no offer, no advice, no real money.",
  },
  {
    href: "/legal/terms-of-service",
    title: "Terms of Service",
    blurb: "What the software does, what you tell us when you use it, and the risks you accept.",
  },
  {
    href: "/legal/privacy-policy",
    title: "Privacy Policy",
    blurb:
      "What is collected, who it reaches, what stays off the chain, and what can never be deleted.",
  },
  {
    href: "/legal/cookies-policy",
    title: "Cookies Policy",
    blurb: "What this site stores in your browser, and what you can do about it.",
  },
]

export default function LegalPage() {
  return (
    <div className="mx-auto w-full max-w-3xl py-16">
      <h1 className="font-medium text-3xl tracking-tight">Legal</h1>
      <p className="mt-2 text-soft text-sm">Last updated {lastUpdated}</p>

      <div className="mt-8 space-y-4 text-[15px] text-body leading-relaxed">
        <p>
          Sowee is a demonstration built for the ETHOnline 2026 hackathon, between 4 and 13
          September 2026. It runs on public test networks with test-value assets. There is no
          company behind it, no registration with any regulator, and nothing here is on sale.
        </p>
        <p>
          The four documents below say that in detail. They describe this project as it is actually
          built, so where a real issuer would point at a licence or a governing law, we say plainly
          that we have neither.
        </p>
      </div>

      <div className="mt-10 divide-y divide-line border-line border-y">
        {documents.map((d) => (
          <Link key={d.href} href={d.href} className="group block py-5">
            <span className="font-medium text-ink group-hover:underline">{d.title}</span>
            <span className="mt-1 block text-[15px] text-soft leading-relaxed">{d.blurb}</span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-[15px] text-body leading-relaxed">
        Questions about any of this:{" "}
        <a className="underline" href="mailto:support@sowee.site">
          support@sowee.site
        </a>
        . The full source is public at{" "}
        <a
          className="underline"
          href="https://github.com/sowee-finance/sowee"
          target="_blank"
          rel="noreferrer"
        >
          github.com/sowee-finance/sowee
        </a>
        .
      </p>
    </div>
  )
}
