import Link from "next/link"
import { Search } from "lucide-react"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { cn } from "@/lib/utils"

interface ScriptLibraryControlsProps {
  query: string
  genre: string
  locale: string
  labels: {
    searchPlaceholder: string
    search: string
    allGenres: string
    genresAria: string
  }
}

export function ScriptLibraryControls({
  query,
  genre,
  locale,
  labels,
}: ScriptLibraryControlsProps) {
  return (
    <div className="space-y-3">
      <form action="/app/scripts/library" className="flex min-h-11 overflow-hidden rounded-xl border border-border bg-card shadow-soft focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{labels.searchPlaceholder}</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={80}
            placeholder={labels.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {genre ? <input type="hidden" name="genre" value={genre} /> : null}
        </label>
        <button type="submit" className="min-w-14 border-l border-border px-3 text-sm font-semibold text-primary">
          {labels.search}
        </button>
      </form>

      <nav aria-label={labels.genresAria} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        <GenreLink value="" label={labels.allGenres} active={!genre} query={query} />
        {SCRIPT_GENRE_OPTIONS.map((value) => (
          <GenreLink
            key={value}
            value={value}
            label={localizeTag(value, locale)}
            active={genre === value}
            query={query}
          />
        ))}
      </nav>
    </div>
  )
}

function GenreLink({
  value,
  label,
  active,
  query,
}: {
  value: string
  label: string
  active: boolean
  query: string
}) {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (value) params.set("genre", value)
  const href = params.size ? `/app/scripts/library?${params.toString()}` : "/app/scripts/library"
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      {label}
    </Link>
  )
}
