"use client"

import Link from "next/link"
import { useSearchParams, usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  total: number
  page: number
  pageSize: number
}

export function Pagination({ total, page, pageSize }: Props) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const totalPages = Math.ceil(total / pageSize)

  if (totalPages <= 1) return null

  function buildUrl(p: number) {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (p === 1) params.delete("page")
    else params.set("page", String(p))
    const qs = params.toString()
    return `${pathname}${qs ? `?${qs}` : ""}`
  }

  const delta = 2
  const range: number[] = []
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
    range.push(i)
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        共 {total} 条，第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={buildUrl(page - 1)} className="p-1 rounded hover:bg-muted transition-colors">
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className="p-1 text-muted-foreground/40"><ChevronLeft className="size-4" /></span>
        )}

        {range[0] > 1 && (
          <>
            <Link href={buildUrl(1)} className="px-2 py-1 rounded hover:bg-muted">1</Link>
            {range[0] > 2 && <span className="px-1 text-muted-foreground">…</span>}
          </>
        )}

        {range.map((p) => (
          <Link
            key={p}
            href={buildUrl(p)}
            className={cn(
              "px-2 py-1 rounded transition-colors",
              p === page
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {p}
          </Link>
        ))}

        {range[range.length - 1] < totalPages && (
          <>
            {range[range.length - 1] < totalPages - 1 && (
              <span className="px-1 text-muted-foreground">…</span>
            )}
            <Link href={buildUrl(totalPages)} className="px-2 py-1 rounded hover:bg-muted">
              {totalPages}
            </Link>
          </>
        )}

        {page < totalPages ? (
          <Link href={buildUrl(page + 1)} className="p-1 rounded hover:bg-muted transition-colors">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="p-1 text-muted-foreground/40"><ChevronRight className="size-4" /></span>
        )}
      </div>
    </div>
  )
}
