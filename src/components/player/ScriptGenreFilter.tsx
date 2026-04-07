"use client"

import { useRouter, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"
import { cn } from "@/lib/utils"

interface Props {
  currentGenre: string
}

export function ScriptGenreFilter({ currentGenre }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations("scripts")

  function handleSelect(genre: string) {
    const params = new URLSearchParams()
    if (genre !== "") params.set("genre", genre)
    router.push(`${pathname}?${params.toString()}`)
  }

  const options = [{ value: "", label: t("allGenres") }, ...SCRIPT_GENRE_OPTIONS.map((g) => ({ value: g, label: g }))]

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleSelect(opt.value)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            currentGenre === opt.value
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
