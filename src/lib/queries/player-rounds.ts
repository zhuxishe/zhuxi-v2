import { createClient } from "@/lib/supabase/server"
import { getSurveyWindowState } from "@/lib/matching/survey-window"
import type { RoundRecord } from "@/types/matching-round"

/** All available entries have their own URL; selecting one never switches rounds. */
export async function fetchPlayerRounds(now = new Date()): Promise<RoundRecord[]> {
  const db = await createClient()
  const { data, error } = await db.from("match_rounds").select("*")
    .eq("status", "open").lte("survey_start", now.toISOString()).gt("survey_end", now.toISOString())
    .order("survey_end", { ascending: true }).limit(100)
  if (error) throw new Error("Unable to load current matching activities")
  return (data ?? []).filter((round) => getSurveyWindowState(round, now) === "open")
}

export async function fetchPlayerRound(id: string): Promise<RoundRecord | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const db = await createClient()
  const { data, error } = await db.from("match_rounds").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error("Unable to load matching activity")
  return data
}

export async function fetchSubmittedRoundIds(memberId: string, roundIds: string[]): Promise<string[]> {
  if (!roundIds.length) return []
  const db = await createClient()
  const { data, error } = await db.from("match_round_submissions").select("round_id")
    .eq("member_id", memberId).in("round_id", roundIds)
  if (error) throw new Error("Unable to load your submissions")
  return (data ?? []).map((submission) => submission.round_id)
}
