"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { ChevronRight, Globe2, LogOut } from "lucide-react"
import { signOut } from "@/app/login/actions"
import { setLocale } from "@/lib/i18n/actions"
import { LineBindingCard } from "@/components/player/LineBindingCard"

interface ProfileSettingsLabels {
  language: string
  languageZh: string
  languageJa: string
  logout: string
  logoutConfirm: string
}

interface ProfileSettingsCardProps {
  lineUserId: string | null
  labels: ProfileSettingsLabels
}

export function ProfileSettingsCard({ lineUserId, labels }: ProfileSettingsCardProps) {
  const locale = useLocale()
  const router = useRouter()
  const [languagePending, startLanguageTransition] = useTransition()

  function switchLanguage() {
    const next = locale === "ja" ? "zh" : "ja"
    startLanguageTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-border/90 bg-card px-4 shadow-soft">
      <LineBindingCard lineUserId={lineUserId} variant="row" />

      <button
        type="button"
        onClick={switchLanguage}
        disabled={languagePending}
        className="flex min-h-[3.25rem] w-full items-center gap-3 border-t border-border/80 py-1 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:opacity-60"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
          <Globe2 className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5">{labels.language}</span>
          <span className="block text-[11px] leading-4 text-muted-foreground">
            {locale === "ja" ? labels.languageJa : labels.languageZh}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground/80" strokeWidth={1.7} aria-hidden="true" />
      </button>

      <form
        action={signOut}
        onSubmit={(event) => {
          if (!window.confirm(labels.logoutConfirm)) event.preventDefault()
        }}
        className="border-t border-border/80"
      >
        <button
          type="submit"
          className="flex min-h-[3.25rem] w-full items-center gap-3 py-1 text-left text-destructive transition-colors hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-inset"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10">
            <LogOut className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold leading-5">{labels.logout}</span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground/80" strokeWidth={1.7} aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
