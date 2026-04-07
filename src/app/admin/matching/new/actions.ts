"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchCandidates, fetchMatchHistory } from "@/lib/queries/matching"
import { toMatchCandidates } from "@/lib/matching/adapter"
import { runMaxCoverageDuoMatching } from "@/lib/matching/max-match"
import { DEFAULT_CONFIG } from "@/lib/matching/config"
import type { MatchingConfig } from "@/lib/matching/types"

interface RunMatchInput {
  sessionName: string
  config?: Partial<MatchingConfig>
}

export async function runMatching(input: RunMatchInput) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  // 1. Fetch approved members
  const rawCandidates = await fetchMatchCandidates()
  if (rawCandidates.length < 2) {
    return { error: "至少需要 2 名已批准成员才能匹配" }
  }

  // 2. Fetch match history + convert to MatchCandidate format
  const memberIds = rawCandidates.map((m) => m.id)
  const historyMap = await fetchMatchHistory(memberIds)
  const candidates = toMatchCandidates(rawCandidates, historyMap)

  // 3. Merge config
  const config: MatchingConfig = { ...DEFAULT_CONFIG, ...input.config }

  // 4. Run max-coverage matching algorithm (pairRelations to be wired later)
  const result = runMaxCoverageDuoMatching(candidates, config)

  // 5. Save session
  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .insert({
      session_name: input.sessionName || `匹配 ${new Date().toLocaleDateString("zh-CN")}`,
      algorithm: "max_coverage",
      config: config as unknown as import("@/types/database.types").Json,
      total_candidates: result.metadata.candidateCount,
      total_matched: result.pairs.length * 2,
      total_unmatched: result.unmatched.length,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (sErr) return { error: sErr.message }

  // 6. Save match results — submissionId → memberId via adapter naming convention
  // toMatchCandidates 使用 memberId 作为 submissionId
  const subIdToMemberId = new Map<string, string>()
  for (const c of candidates) subIdToMemberId.set(c.submissionId, c.submissionId)

  const resultRows = result.pairs.map((pair, i) => ({
    session_id: session.id,
    member_a_id: subIdToMemberId.get(pair.a.submissionId) ?? pair.a.submissionId,
    member_b_id: subIdToMemberId.get(pair.b.submissionId) ?? pair.b.submissionId,
    total_score: pair.score.totalScore,
    score_breakdown: pair.score.breakdown as unknown as import("@/types/database.types").Json,
    rank: i + 1,
    best_slot: pair.bestSlot || null,
  }))

  if (resultRows.length > 0) {
    const { error: rErr } = await supabase
      .from("match_results")
      .insert(resultRows)

    if (rErr) return { error: rErr.message }
  }

  return { success: true, sessionId: session.id }
}
