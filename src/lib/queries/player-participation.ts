import { createClient } from "@/lib/supabase/server"
import type { PlayerParticipationRecord, PlayerParticipationDetail } from "@/types/player-participation"

const ROUND_COLUMNS = "id, round_name, status, purpose, survey_start, survey_end, activity_start, activity_end, content_config, config_revision" as const
const PAGE_SIZE = 100

/** Start with this member's submissions so closing a round never removes their record. */
export async function fetchPlayerParticipationRecords(memberId: string): Promise<PlayerParticipationRecord[]> {
  const db = await createClient()
  const records: PlayerParticipationRecord[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from("match_round_submissions")
      .select(`id, created_at, updated_at, cancelled_at, round:match_rounds!inner(${ROUND_COLUMNS})`)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error("Unable to load your participation records")
    records.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return records
  }
}

/** Member identity comes from requirePlayer at the route; RLS also restricts the row. */
export async function fetchPlayerParticipationDetail(memberId: string, roundId: string): Promise<PlayerParticipationDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roundId)) return null
  const db = await createClient()
  const { data, error } = await db.from("match_round_submissions")
    .select(`id, created_at, updated_at, cancelled_at, game_type_pref, gender_pref, availability, interest_tags, social_style, message, custom_answers, round:match_rounds!inner(${ROUND_COLUMNS})`)
    .eq("member_id", memberId)
    .eq("round_id", roundId)
    .maybeSingle()
  if (error) throw new Error("Unable to load your participation record")
  return data
}
