"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchCandidates } from "@/lib/queries/matching"
import { toMatchCandidates } from "@/lib/matching/adapter"
import { runDuoMatching } from "@/lib/matching"
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

  // 2. Convert to MatchCandidate format
  const candidates = toMatchCandidates(rawCandidates)

  // 3. Merge config
  const config: MatchingConfig = { ...DEFAULT_CONFIG, ...input.config }

  // 4. Run matching algorithm
  const result = runDuoMatching(candidates, config)

  // 5. Save session
  const { data: session, error: sErr } = await supabase
    .from("match_sessions")
    .insert({
      session_name: input.sessionName || `匹配 ${new Date().toLocaleDateString("zh-CN")}`,
      algorithm: result.metadata.algorithmUsed,
      config: config as unknown as Record<string, unknown>,
      total_candidates: result.metadata.candidateCount,
      total_matched: result.pairs.length * 2,
      total_unmatched: result.unmatched.length,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (sErr) return { error: sErr.message }

  // 6. Save match results
  // Build name→memberId map
  const nameToId = new Map<string, string>()
  for (const m of rawCandidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (m as any).member_identity?.full_name
    if (name) nameToId.set(name, m.id)
  }

  const resultRows = result.pairs.map((pair) => ({
    session_id: session.id,
    member_a_id: nameToId.get(pair.userA) ?? rawCandidates[0]?.id,
    member_b_id: nameToId.get(pair.userB) ?? rawCandidates[1]?.id,
    total_score: pair.score.totalScore,
    score_breakdown: pair.score.breakdown,
    rank: pair.rank,
  }))

  if (resultRows.length > 0) {
    const { error: rErr } = await supabase
      .from("match_results")
      .insert(resultRows)

    if (rErr) return { error: rErr.message }
  }

  return { success: true, sessionId: session.id }
}
