/** Shared shell for the legal documents: the container, type scale and tone of the rest of site. */
export function Doc({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-3xl py-16">
      <h1 className="font-medium text-3xl tracking-tight">{title}</h1>
      <p className="mt-2 text-soft text-sm">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-[15px] text-body leading-relaxed">{children}</div>
    </div>
  )
}

/** A section heading inside a document. */
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-4 font-medium text-ink text-lg">{children}</h2>
}

/** A bulleted list inside a document. */
export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>
}

/** The date every document carries, so they move together. */
export const lastUpdated = "7 September 2026"
