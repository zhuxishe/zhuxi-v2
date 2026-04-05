"use server"

import { createClient } from "@/lib/supabase/server"
import { requirePlayer } from "@/lib/auth/player"

interface ReviewInput {
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

  const { error } = await supabase
    .from("mutual_reviews")
    .insert({
      reviewer_id: player.memberId,
      ...input,
    })

  if (error) return { error: error.message }
  return { success: true }
}
