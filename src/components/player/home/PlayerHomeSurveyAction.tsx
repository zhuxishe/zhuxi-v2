"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import type { SurveyWindow } from "@/lib/matching/survey-window"
import { PlayerHomeActionCard } from "./PlayerHomeActionCard"
import type { PlayerHomeAction } from "./types"
import type { RoundPurpose } from "@/types/matching-round"

interface Props {
  action: PlayerHomeAction
  fallbackAction: PlayerHomeAction
  round: (SurveyWindow & { id: string }) | null
  hasSubmitted: boolean
  initialNow: string
  roundHref?: string
  purpose?: RoundPurpose
  showAll?: boolean
}

export function PlayerHomeSurveyAction({ action, fallbackAction, round, hasSubmitted, initialNow, roundHref = "/app/matching/survey", purpose = "matching", showAll = false }: Props) {
  const router = useRouter()
  const t = useTranslations("survey")
  const roundT = useTranslations("rounds")
  const state = useSurveyWindow(round ?? { status: "closed", survey_start: "", survey_end: "" }, initialNow)
  const refreshedRound = useRef<string | null>(null)
  const available = state === "open"

  useEffect(() => {
    if (round && !available && refreshedRound.current !== round.id) {
      refreshedRound.current = round.id
      router.refresh()
    }
  }, [available, round, router])

  return (
    <div>
      <PlayerHomeActionCard action={round && !available ? fallbackAction : action} />
      {available && hasSubmitted && (
        <Link href={roundHref} className="mt-3 inline-block text-sm text-primary underline underline-offset-4">
          {purpose === "registration" ? roundT("registeredEdit") : t("status.submitted")}
        </Link>
      )}
      {showAll && <Link href="/app/matching" className="mt-3 block text-sm text-primary underline underline-offset-4">{roundT("viewAll")}</Link>}
    </div>
  )
}
