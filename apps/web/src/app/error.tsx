"use client"

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container-page flex min-h-svh flex-col items-center justify-center gap-4 text-center">
      <h1 className="font-medium text-2xl tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-soft">
        An unexpected error occurred. Try again, or come back in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-ink px-5 py-2.5 font-medium text-sm text-white hover:bg-black"
      >
        Try again
      </button>
    </main>
  )
}
