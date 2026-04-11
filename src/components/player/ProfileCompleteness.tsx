"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { CheckCircle, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProfileCompleteness as PC } from "@/lib/queries/profile"

interface Props {
  completeness: PC
}

const SECTIONS = [
  { key: "identity", href: null, tKey: "identity" },
  { key: "supplementary", href: "/app/profile/supplementary", tKey: "supplementary" },
  { key: "personality", href: "/app/profile/personality", tKey: "personality" },
  { key: "quiz", href: "/app/profile/quiz", tKey: "quiz" },
] as const

export function ProfileCompleteness({ completeness }: Props) {
  const t = useTranslations("playerHome")

  return (
    <div className="rounded-xl bg-card p-5 shadow-soft space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="heading-display text-sm">{t("profileTitle")}</h2>
        <span className="text-2xl font-bold text-gold">{completeness.percentage}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-gold transition-all duration-700 ease-out"
          style={{ width: `${completeness.percentage}%` }}
        />
      </div>

      {/* Section checklist */}
      <div className="space-y-2">
        {SECTIONS.map(({ key, href, tKey }) => {
          const done = completeness[key as keyof PC] as boolean
          const content = (
            <div className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              done ? "text-muted-foreground" : "text-foreground",
              href && "hover:bg-muted/50 cursor-pointer"
            )}>
              {done
                ? <CheckCircle className="size-4 text-primary shrink-0" />
                : <Circle className="size-4 text-muted-foreground shrink-0" />
              }
              <span className={cn(done && "line-through")}>{t(tKey)}</span>
            </div>
          )

          if (href) {
            return <Link key={key} href={href}>{content}</Link>
          }
          return <div key={key}>{content}</div>
        })}
      </div>
    </div>
  )
}
