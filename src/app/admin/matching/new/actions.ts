"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchCandidates, fetchMatchHistory } from "@/lib/queries/matching"
import { toMatchCandidates } from "@/lib/matching/adapter"
import { runFullMatching } from "@/lib/matching/run-matching"
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

  // 4. 三阶段分流匹配（双人 → 多人 → 回流）
  // toMatchCandidates 使用 memberId 作为 submissionId
  const idMap = new Map<string, string>()
  for (const c of candidates) idMap.set(c.submissionId, c.submissionId)

  const result = runFullMatching(candidates, config, idMap)

  // 5. Save session
  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .insert({
      session_name: input.sessionName || `匹配 ${new Date().toLocaleDateString("zh-CN")}`,
      algorithm: "max_coverage_split",
      config: config as unknown as import("@/types/database.types").Json,
      total_candidates: result.totalCandidates,
      total_matched: result.totalMatched,
      total_unmatched: result.totalUnmatched,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (sErr) return { error: sErr.message }

  // 6. Save match results
  const resultRows = result.rows.map((r) => ({
    session_id: session.id,
    member_a_id: r.member_a_id,
    member_b_id: r.member_b_id,
    group_members: r.group_members,
    total_score: r.total_score,
    score_breakdown: r.score_breakdown as import("@/types/database.types").Json,
    rank: r.rank,
    best_slot: r.best_slot,
  }))

  if (resultRows.length > 0) {
    const { error: rErr } = await supabase.from("match_results").insert(resultRows)
    if (rErr) return { error: rErr.message }
  }

  return { success: true, sessionId: session.id }
}
