import type { MetadataRoute } from "next"

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sowee.site"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site}/sitemap.xml`,
  }
}
