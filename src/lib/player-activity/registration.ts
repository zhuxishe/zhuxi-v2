import { unstable_rethrow } from "next/navigation"
import { roundHref } from "@/lib/matching/round-display"
import { getRoundSubmissionAccess } from "@/lib/matching/round-submission-access"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import { fetchPlayerRound } from "@/lib/queries/player-rounds"
import { effectiveRegistrationStatus } from "./selection"
import type { LargeActivityRegistrationStatus, LargeActivitySummary } from "./types"

type RegistrationActivity = Pick<LargeActivitySummary,
  "status" | "registrationUrl" | "registrationStatus" | "registrationDeadline"
> & { registrationRoundId: string | null }

type RegistrationDisplay = {
  source: "manual" | "round"
  status: LargeActivityRegistrationStatus
  href: string | null
  deadline: string | null
}

const CLOSED_ROUND: RegistrationDisplay = {
  source: "round",
  status: "closed",
  href: null,
  deadline: null,
}

const ROUND_WINDOW_STATUS = {
  draft: "closed",
  scheduled: "coming_soon",
  open: "open",
  expired: "ended",
  closed: "closed",
  matched: "ended",
} as const

export async function resolveLargeActivityRegistration(
  activity: RegistrationActivity,
  playerId: string,
  now: Date,
): Promise<RegistrationDisplay> {
  if (!activity.registrationRoundId) {
    return {
      source: "manual",
      status: effectiveRegistrationStatus(activity, now),
      href: safeExternalUrl(activity.registrationUrl),
      deadline: activity.registrationDeadline,
    }
  }
  if (activity.status === "cancelled") return CLOSED_ROUND

  try {
    const round = await fetchPlayerRound(activity.registrationRoundId)
    if (!round || round.deleted_at || round.is_test !== false || round.status === "draft"
      || (round.purpose !== "registration" && round.purpose !== "matching")) {
      return CLOSED_ROUND
    }
    const access = await getRoundSubmissionAccess(round, playerId)
    if (!access.allowed) return CLOSED_ROUND

    const window = getSurveyWindowState(round, now)
    if (window === "invalid") return CLOSED_ROUND

    return {
      source: "round",
      status: ROUND_WINDOW_STATUS[window],
      href: window === "open" ? roundHref(round.id) : null,
      deadline: round.survey_end,
    }
  } catch (error) {
    unstable_rethrow(error)
    console.error("[large-activity-registration] Failed to load the linked round", error)
    return CLOSED_ROUND
  }
}

function safeExternalUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? value : null
  } catch {
    return null
  }
}
