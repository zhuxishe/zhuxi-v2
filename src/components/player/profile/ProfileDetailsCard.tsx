import { ChevronDown } from "lucide-react"
import type { ProfileDetailRow, ProfileDetailSection } from "@/lib/profile/details"

export function ProfileDetailRows({ rows }: { rows: ProfileDetailRow[] }) {
  return (
    <dl className="divide-y divide-border/70">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-3 text-sm">
          <dt className="min-w-0 break-words text-xs leading-5 text-muted-foreground">{row.label}</dt>
          <dd className={`min-w-0 whitespace-pre-wrap break-words leading-5 ${row.missing ? "text-muted-foreground" : "text-foreground"}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ProfileDetailsCard({ title, hint, sections }: {
  title: string
  hint: string
  sections: ProfileDetailSection[]
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-border/90 bg-card shadow-soft">
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      {sections.map((section) => (
        <details key={section.key} className="group border-t border-border/80">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
            {section.title}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-4 pb-2"><ProfileDetailRows rows={section.rows} /></div>
        </details>
      ))}
    </section>
  )
}
