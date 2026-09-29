"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"
import type { SurveyWindow } from "@/lib/matching/survey-window"
import { PlayerHomeActionCard } from "./PlayerHomeActionCard"
import type { PlayerHomeAction } from "./types"

interface Props {
  action: PlayerHomeAction
  fallbackAction: PlayerHomeAction
  round: (SurveyWindow & { id: string }) | null
  initialNow: string
}

export function PlayerHomeSurveyAction({ action, fallbackAction, round, initialNow }: Props) {
  const router = useRouter()
  const state = useSurveyWindow(round ?? { status: "closed", survey_start: "", survey_end: "" }, initialNow)
  const refreshedRound = useRef<string | null>(null)
  const available = state === "open"

  useEffect(() => {
    if (round && !available && refreshedRound.current !== round.id) {
      refreshedRound.current = round.id
      router.refresh()
    }
  }, [available, round, router])

  return <PlayerHomeActionCard action={round && !available ? fallbackAction : action} />
}
