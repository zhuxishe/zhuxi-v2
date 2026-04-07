"use client"

import Link from "next/link"
import { ClipboardCheck, Clock } from "lucide-react"
import { useTranslations } from "next-intl"

interface Props {
  roundName: string
  surveyEnd: string
  hasSubmitted: boolean
}

export function SurveyStatusCard({ roundName, surveyEnd, hasSubmitted }: Props) {
  const t = useTranslations("survey")
  const deadline = new Date(surveyEnd)
  const now = new Date()
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

  return (
    <Link href="/app/matching/survey">
      <div className={`rounded-xl p-4 shadow-soft transition-all ${
        hasSubmitted
          ? "bg-green-50 dark:bg-green-950/20"
          : "gradient-sakura hover:shadow-soft-lg"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2.5 ${hasSubmitted ? "bg-green-100 dark:bg-green-900/40" : "bg-sakura/15"}`}>
            <ClipboardCheck className={`size-5 ${hasSubmitted ? "text-green-600" : "text-sakura"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="heading-display text-sm">{roundName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasSubmitted ? t("status.submitted") : t("status.newRound")}
            </p>
          </div>
          {!hasSubmitted && daysLeft > 0 && (
            <div className="flex items-center gap-1 text-xs font-medium text-sakura shrink-0">
              <Clock className="size-3" />
              <span>{t("status.daysLeft", { days: daysLeft })}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
