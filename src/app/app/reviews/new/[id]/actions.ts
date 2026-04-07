"use server"

import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"

interface ReviewInput {
  match_result_id: string
  reviewee_id: string
  overall_score: number
  punctuality_score: number
  communication_score: number
  teamwork_score: number
  fun_score: number
  would_play_again: boolean
  positive_tags: string[]
  negative_tags: string[]
  comment: string
}

export async function submitReview(input: ReviewInput) {
  const player = await requirePlayer()
  const supabase = await createClient()

  // 防重复：检查是否已评价
  const { data: existing } = await supabase
    .from("mutual_reviews")
    .select("id")
    .eq("match_result_id", input.match_result_id)
    .eq("reviewer_id", player.memberId)
    .maybeSingle()

  if (existing) return { error: "alreadyReviewed" }

  const { error } = await supabase
    .from("mutual_reviews")
    .insert({
      reviewer_id: player.memberId,
      ...input,
    })

  if (error) return { error: error.message }
  return { success: true }
}
