"use server"

import { revalidatePath } from "next/cache"
import { requirePlayer } from "@/lib/auth/player"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchMatchDetail } from "@/lib/queries/matching"

interface ReviewInput {
  match_result_id: string
  expected_publication_version: number
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
  const supabase = createAdminClient()
  if (input.reviewee_id === player.memberId) return { error: "unauthorized" }
  if (!Number.isSafeInteger(input.expected_publication_version) || input.expected_publication_version < 1) return { error: "matchPublicationChanged" }

  // 安全：从 match_result 重新派生 reviewee_id，不信任客户端传值
  const mr = await fetchMatchDetail(input.match_result_id, player.memberId)

  if (!mr || mr.status !== "confirmed") return { error: "matchNotFound" }
  if (mr.publication_version !== input.expected_publication_version) return { error: "matchPublicationChanged" }

  // 确认当前玩家是配对参与者，并派生对手 ID
  let revieweeId: string | null = null
  const groupMembers = mr.group_members as string[] | null
  if (Array.isArray(groupMembers) && groupMembers.length > 0) {
    if (groupMembers.includes(player.memberId) && groupMembers.includes(input.reviewee_id)) {
      revieweeId = input.reviewee_id
    }
  } else if (mr.member_a_id === player.memberId) {
    revieweeId = mr.member_b_id
  } else if (mr.member_b_id === player.memberId) {
    revieweeId = mr.member_a_id
  }

  if (!revieweeId) return { error: "unauthorized" }

  // 防重复：检查是否已评价
  const { data: existing } = await supabase
    .from("mutual_reviews")
    .select("id")
    .eq("match_result_id", input.match_result_id)
    .eq("reviewer_id", player.memberId)
    .eq("reviewee_id", revieweeId)
    .maybeSingle()

  if (existing) return { error: "alreadyReviewed" }

  const { error } = await supabase
    .from("mutual_reviews")
    .insert({
      match_result_id: input.match_result_id,
      match_publication_version: input.expected_publication_version,
      reviewer_id: player.memberId,
      reviewee_id: revieweeId, // 使用服务端派生值，非客户端传值
      overall_score: input.overall_score,
      punctuality_score: input.punctuality_score,
      communication_score: input.communication_score,
      teamwork_score: input.teamwork_score,
      fun_score: input.fun_score,
      would_play_again: input.would_play_again,
      positive_tags: input.positive_tags,
      negative_tags: input.negative_tags,
      comment: input.comment,
    })

  if (error) {
    if (/MATCH_PUBLICATION_STALE|MATCH_NOT_PUBLISHED|MATCH_PUBLICATION_NOT_PUBLISHED/.test(error.message)) return { error: "matchPublicationChanged" }
    console.error("[submitReview]", error)
    return { error: "saveFailed" }
  }

  revalidatePath("/app/matches")
  revalidatePath(`/app/matches/${input.match_result_id}`)
  return { success: true }
}
