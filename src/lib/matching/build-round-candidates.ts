import { createClient } from "@/lib/supabase/server"
import { fetchMatchHistory } from "@/lib/queries/match-history"
import { getImportedHistory } from "./import-metadata"
import { mergeMatchHistory } from "./round-import-utils"
import { submissionToCandidate } from "./adapter-submission"
import type { MatchCandidate } from "./types"

const ROUND_MEMBER_SELECT = `
  *,
  member:members (
    id, member_number, status, attractiveness_score,
    member_identity (*),
    member_personality (warmup_speed, expression_style_tags, group_role_tags),
    member_interests (*),
    member_language (*),
    member_boundaries (*),
    member_dynamic_stats (*),
    personality_quiz_results (score_e, score_a, score_o, score_c, score_n)
  )
`

type RoundSubmission = Record<string, any>

function sortSubmissions(submissions: RoundSubmission[], memberIds?: string[]) {
  if (!memberIds?.length) return submissions
  const indexMap = new Map(memberIds.map((id, index) => [id, index]))
  return [...submissions].sort(
    (a, b) => (indexMap.get(a.member_id) ?? 0) - (indexMap.get(b.member_id) ?? 0),
  )
}

export async function buildRoundCandidates(roundId: string, memberIds?: string[]) {
  const supabase = await createClient()
  let query = supabase
    .from("match_round_submissions")
    .select(ROUND_MEMBER_SELECT)
    .eq("round_id", roundId)

  if (memberIds?.length) query = query.in("member_id", memberIds)

  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) throw error

  const submissions = sortSubmissions(data ?? [], memberIds)
  const foundIds = submissions.map((sub) => sub.member_id as string)
  if (memberIds?.length && submissions.length !== memberIds.length) {
    const missing = memberIds.filter((id) => !foundIds.includes(id))
    throw new Error(`成员 ${missing[0]} 未提交本轮问卷，无法参与匹配`)
  }

  const historyMap = await fetchMatchHistory(foundIds)
  const candidates = submissions.map((sub) => {
    const member = Array.isArray(sub.member) ? sub.member[0] : sub.member
    const history = mergeMatchHistory(
      historyMap.get(sub.member_id) ?? [],
      getImportedHistory((sub as Record<string, unknown>).import_metadata),
    )
    return submissionToCandidate(sub, member, history)
  })

  return { submissions, candidates: candidates as MatchCandidate[] }
}
