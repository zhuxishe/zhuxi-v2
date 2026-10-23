"use server"

import { resumeMatchingRun, abandonRoundMatchingRun } from "@/lib/matching/round-run-service"

export async function resumeRoundMatching(runId: string, reason: string) {
  return resumeMatchingRun(runId, reason)
}

export async function abandonMatchingRun(runId: string, reason: string) {
  return abandonRoundMatchingRun(runId, reason)
}
