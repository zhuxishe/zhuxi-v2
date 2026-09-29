import type { Database } from "./database.types"
import type { RoundRecord } from "./matching-round"

export interface PlayerParticipationRecord {
  id: string
  created_at: string | null
  updated_at: string | null
  round: RoundRecord
}

export type PlayerParticipationDetail = PlayerParticipationRecord & Pick<
  Database["public"]["Tables"]["match_round_submissions"]["Row"],
  "game_type_pref" | "gender_pref" | "availability" | "interest_tags" | "social_style" | "message" | "custom_answers"
>
