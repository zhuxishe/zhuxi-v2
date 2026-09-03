import Link from "next/link"
import { Search } from "lucide-react"
import type { ReactNode } from "react"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"
import { localizeTag } from "@/lib/constants/tags-i18n"
import type { PlayerScriptLibrarySort } from "@/lib/player-activity/types"
import { cn } from "@/lib/utils"

interface ScriptLibraryControlsProps {
  query: string
  genre: string
  headcount: number | null
  duration: number | null
  sort: PlayerScriptLibrarySort
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
  headcount,
  duration,
  sort,
  locale,
  labels,
}: ScriptLibraryControlsProps) {
  const ja = locale === "ja"
  const preservedFilters = { query, headcount, duration, sort }

  return (
    <div className="space-y-3">
      <form action="/app/scripts/library" className="space-y-2.5">
        <div className="flex min-h-11 overflow-hidden rounded-xl border border-border bg-card shadow-soft focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
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
        </div>

        <div className="grid grid-cols-3 gap-2">
          <FilterSelect name="headcount" defaultValue={headcount?.toString() ?? ""} ariaLabel={ja ? "人数で絞り込む" : "按人数筛选"}>
            <option value="">人数</option>
            {[2, 3, 4, 5, 6, 7, 8, 10].map((value) => <option key={value} value={value}>{value}{ja ? "人" : "人"}</option>)}
          </FilterSelect>
          <FilterSelect name="duration" defaultValue={duration?.toString() ?? ""} ariaLabel={ja ? "所要時間で絞り込む" : "按时长筛选"}>
            <option value="">{ja ? "所要時間" : "时长"}</option>
            {[60, 120, 180, 240, 300].map((value) => <option key={value} value={value}>≤ {value}{ja ? "分" : "分钟"}</option>)}
          </FilterSelect>
          <FilterSelect name="sort" defaultValue={sort} ariaLabel={ja ? "並び順" : "排序方式"}>
            <option value="newest">{ja ? "新着順" : "最新"}</option>
            <option value="recommended">{ja ? "おすすめ順" : "推荐"}</option>
          </FilterSelect>
        </div>
      </form>

      <nav aria-label={labels.genresAria} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        <GenreLink value="" label={labels.allGenres} active={!genre} filters={preservedFilters} />
        {SCRIPT_GENRE_OPTIONS.map((value) => (
          <GenreLink
            key={value}
            value={value}
            label={localizeTag(value, locale)}
            active={genre === value}
            filters={preservedFilters}
          />
        ))}
      </nav>
    </div>
  )
}

function FilterSelect({
  name,
  defaultValue,
  ariaLabel,
  children,
}: {
  name: string
  defaultValue: string
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className="min-w-0 rounded-xl border border-border bg-card px-2 py-2.5 text-xs text-foreground shadow-soft outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
    >
      {children}
    </select>
  )
}

interface PreservedFilters {
  query: string
  headcount: number | null
  duration: number | null
  sort: PlayerScriptLibrarySort
}

function GenreLink({
  value,
  label,
  active,
  filters,
}: {
  value: string
  label: string
  active: boolean
  filters: PreservedFilters
}) {
  const params = buildLibraryParams({ ...filters, genre: value })
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

export function ScriptLibraryPagination({
  page,
  totalPages,
  query,
  genre,
  headcount,
  duration,
  sort,
  locale,
}: {
  page: number
  totalPages: number
  query: string
  genre: string
  headcount: number | null
  duration: number | null
  sort: PlayerScriptLibrarySort
  locale: string
}) {
  if (totalPages <= 1) return null
  const previous = Math.max(1, page - 1)
  const next = Math.min(totalPages, page + 1)
  const base = { query, genre, headcount, duration, sort }

  return (
    <nav aria-label={locale === "ja" ? "ページ送り" : "分页"} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <PaginationLink page={previous} filters={base}>{locale === "ja" ? "前へ" : "上一页"}</PaginationLink>
      ) : <span className="min-h-10 min-w-20" />}
      <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
      {page < totalPages ? (
        <PaginationLink page={next} filters={base}>{locale === "ja" ? "次へ" : "下一页"}</PaginationLink>
      ) : <span className="min-h-10 min-w-20" />}
    </nav>
  )
}

function PaginationLink({
  page,
  filters,
  children,
}: {
  page: number
  filters: PreservedFilters & { genre: string }
  children: ReactNode
}) {
  const params = buildLibraryParams({ ...filters, page })
  return (
    <Link href={`/app/scripts/library?${params.toString()}`} className="inline-flex min-h-10 min-w-20 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-semibold text-primary shadow-soft">
      {children}
    </Link>
  )
}

function buildLibraryParams({
  query,
  genre,
  headcount,
  duration,
  sort,
  page,
}: PreservedFilters & { genre?: string; page?: number }) {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  if (genre) params.set("genre", genre)
  if (headcount) params.set("headcount", String(headcount))
  if (duration) params.set("duration", String(duration))
  if (sort !== "newest") params.set("sort", sort)
  if (page && page > 1) params.set("page", String(page))
  return params
}
