"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { setLocale } from "@/lib/i18n/actions"
import { cn } from "@/lib/utils"

const LOCALE_LABELS = { zh: "\u4E2D\u6587", ja: "\u65E5\u672C\u8A9E" } as const

interface Props {
  className?: string
}

export function LocaleSwitcher({ className }: Props) {
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSwitch() {
    const next = locale === "zh" ? "ja" : "zh"
    startTransition(async () => {
      await setLocale(next as "zh" | "ja")
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleSwitch}
      disabled={isPending}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50",
        className,
      )}
      aria-label="Switch language"
    >
      <span className={cn(locale === "zh" ? "text-foreground" : "text-muted-foreground")}>
        {LOCALE_LABELS.zh}
      </span>
      <span className="text-border">/</span>
      <span className={cn(locale === "ja" ? "text-foreground" : "text-muted-foreground")}>
        {LOCALE_LABELS.ja}
      </span>
    </button>
  )
}
