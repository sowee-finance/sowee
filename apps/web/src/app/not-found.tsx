import Link from "next/link"

export default function NotFound() {
  return (
    <main className="container-page flex min-h-svh flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-sm text-soft">404</p>
      <h1 className="font-medium text-2xl tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-soft">
        The page you are looking for does not exist or the invoice bond is no longer listed.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-ink px-5 py-2.5 font-medium text-sm text-white hover:bg-black"
      >
        Back to Marketplace
      </Link>
    </main>
  )
}
