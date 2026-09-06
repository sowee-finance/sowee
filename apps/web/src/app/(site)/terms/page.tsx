import { redirect } from "next/navigation"

/** The old route, kept alive: the terms now live in the legal section. */
export default function TermsPage() {
  redirect("/legal/terms-of-service")
}
