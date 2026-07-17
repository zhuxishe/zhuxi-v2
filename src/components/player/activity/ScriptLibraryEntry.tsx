import { BookOpen, ChevronRight } from "lucide-react"
import Link from "next/link"

export function ScriptLibraryEntry({ title, description }: { title: string; description: string }) {
  return (
    <Link
      href="/app/scripts/library"
      className="group flex min-h-14 items-center gap-3 rounded-[20px] border border-border bg-card px-4 shadow-soft transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary">
        <BookOpen className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-5">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
