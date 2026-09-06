import { redirect } from "next/navigation"

/** The old route, kept alive: the privacy policy now lives in the legal section. */
export default function PrivacyPage() {
  redirect("/legal/privacy-policy")
}
