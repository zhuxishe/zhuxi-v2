"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"
import { cn } from "@/lib/utils"

export function ScriptGenreFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get("genre") ?? ""

  function handleSelect(genre: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (genre === "") {
      params.delete("genre")
    } else {
      params.set("genre", genre)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const options = [{ value: "", label: "全部" }, ...SCRIPT_GENRE_OPTIONS.map((g) => ({ value: g, label: g }))]

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleSelect(opt.value)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            current === opt.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
