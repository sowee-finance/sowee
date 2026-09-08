import type { MetadataRoute } from "next"

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sowee.site"

// One page, and it says so honestly rather than listing the app's routes: those live on another
// origin and are that app's to declare.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: site, changeFrequency: "daily", priority: 1 }]
}
