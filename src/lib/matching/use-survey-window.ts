"use client"

import { useEffect, useState } from "react"
import { getSurveyWindowState, type SurveyWindow } from "./survey-window"

/** Recheck at boundaries and on return to a suspended/background tab. */
export function useSurveyWindow(round: SurveyWindow, initialNow: string) {
  const { status, survey_start, survey_end } = round
  const [state, setState] = useState(() => getSurveyWindowState(round, new Date(initialNow)))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function sync() {
      clearTimeout(timer)
      const now = new Date()
      setState(getSurveyWindowState({ status, survey_start, survey_end }, now))
      const next = [Date.parse(survey_start), Date.parse(survey_end)].filter((time) => time > now.getTime())
      timer = setTimeout(sync, Math.min(60_000, ...next.map((time) => time - now.getTime() + 1)))
    }
    timer = setTimeout(sync, 0)
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("focus", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [status, survey_start, survey_end])
  return state
}
