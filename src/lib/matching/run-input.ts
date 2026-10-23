import { submissionToCandidate } from "./adapter-submission"
import { DEFAULT_CONFIG } from "./config"
import { getImportMetadata, getImportedHistory } from "./import-metadata"
import { buildPairRelations } from "./pair-history"
import type { BlacklistRecord, FeedbackRecord, PairRelation } from "./pair-history"
import { parseMatchingReadiness, type MatchingReadiness } from "./profile-readiness"
import { mergeMatchHistory } from "./round-import-utils"
import type { MatchCandidate, MatchingConfig } from "./types"

export const MATCHING_ENGINE_ALGORITHM_VERSION = "max_coverage_split:1" as const
export const MATCHING_RUN_ADAPTER_VERSION = 1 as const

type Row = Record<string, unknown>
type HistoryEntry = { name: string; count: number }
type HistoryRow = { id: string; member_a_id: string; member_b_id: string | null; group_members: string[] | null }

export interface MatchingRunEligibility {
  member_id: string
  eligible: boolean
  reasons: string[]
  readiness: MatchingReadiness | null
  import_exempt: boolean
}

export interface MatchingEngineInput {
  candidates: MatchCandidate[]
  pairRelations: [string, PairRelation][]
  idMap: [string, string][]
  config: MatchingConfig
  algorithm_version: typeof MATCHING_ENGINE_ALGORITHM_VERSION
  adapter_version: typeof MATCHING_RUN_ADAPTER_VERSION
}

export interface PreparedMatchingRunInput {
  snapshotId: string
  capturedAt: string
  submissions: Row[]
  candidates: MatchCandidate[]
  pairRelations: Map<string, PairRelation>
  idMap: Map<string, string>
  config: MatchingConfig
  engineInput: MatchingEngineInput
  exclusions: MatchingRunEligibility[]
}

function invalid(path: string): never {
  throw new Error(`Invalid matching input snapshot: ${path}`)
}

function record(value: unknown, path: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path)
  return value as Row
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path)
  return value
}

function uuid(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid(path)
  return value
}

function strings(value: unknown, path: string): string[] {
  const values = array(value, path)
  if (values.some((item) => typeof item !== "string")) invalid(path)
  return values as string[]
}

function nullableFields(row: Row, path: string, fields: string[], type: "string" | "number" | "boolean") {
  for (const field of fields) {
    const value = row[field]
    if (value === undefined || value === null) continue
    if (typeof value !== type || (type === "number" && !Number.isFinite(value))) invalid(`${path}.${field}`)
  }
}

function stringArrays(row: Row, path: string, fields: string[]) {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null) strings(row[field], `${path}.${field}`)
  }
}

function relation(value: unknown, path: string): Row | null {
  if (value === undefined || value === null) return null
  // The old adapter accepts both Supabase's object and one-to-one array shapes.
  if (Array.isArray(value)) {
    value.forEach((item, index) => record(item, `${path}[${index}]`))
    return value.length ? record(value[0], `${path}[0]`) : null
  }
  return record(value, path)
}

function validateMember(value: unknown, memberId: string, path: string) {
  if (value === null) return
  const member = record(value, path)
  if (uuid(member.id, `${path}.id`) !== memberId) invalid(`${path}.id`)
  nullableFields(member, path, ["status", "account_status", "membership_type", "record_scope", "record_source", "member_number", "anonymized_at"], "string")
  if (member.user_id !== undefined && member.user_id !== null) uuid(member.user_id, `${path}.user_id`)
  nullableFields(member, path, ["attractiveness_score"], "number")
  const identity = relation(member.member_identity, `${path}.member_identity`)
  if (identity) {
    nullableFields(identity, `${path}.member_identity`, ["full_name", "nickname", "gender", "school_name", "current_city"], "string")
    stringArrays(identity, `${path}.member_identity`, ["hobby_tags", "personality_self_tags", "taboo_tags"])
  }
  const personality = relation(member.member_personality, `${path}.member_personality`)
  if (personality) {
    nullableFields(personality, `${path}.member_personality`, ["warmup_speed"], "string")
    stringArrays(personality, `${path}.member_personality`, ["expression_style_tags", "group_role_tags"])
  }
  const interests = relation(member.member_interests, `${path}.member_interests`)
  if (interests) {
    stringArrays(interests, `${path}.member_interests`, ["scenario_mode_pref", "scenario_theme_tags"])
    nullableFields(interests, `${path}.member_interests`, ["accept_beginners", "accept_cross_school"], "boolean")
    nullableFields(interests, `${path}.member_interests`, ["activity_area"], "string")
  }
  const boundaries = relation(member.member_boundaries, `${path}.member_boundaries`)
  if (boundaries) stringArrays(boundaries, `${path}.member_boundaries`, ["taboo_tags", "deal_breakers"])
  const language = relation(member.member_language, `${path}.member_language`)
  if (language) {
    stringArrays(language, `${path}.member_language`, ["communication_language_pref"])
    nullableFields(language, `${path}.member_language`, ["japanese_level"], "string")
  }
  const stats = relation(member.member_dynamic_stats, `${path}.member_dynamic_stats`)
  if (stats) nullableFields(stats, `${path}.member_dynamic_stats`, ["activity_count", "reliability_score"], "number")
  const quiz = relation(member.personality_quiz_results, `${path}.personality_quiz_results`)
  if (quiz && ["score_e", "score_a", "score_o", "score_c", "score_n"].some((key) => typeof quiz[key] !== "number" || !Number.isFinite(quiz[key]))) {
    invalid(`${path}.personality_quiz_results`)
  }
}

function validateImport(value: unknown, path: string) {
  // Historical rows that the existing adapter treats as no import metadata must
  // remain ordinary profile-backed candidates. Eligibility is decided in SQL.
  const metadata = getImportMetadata(value)
  if (!metadata) return
  const legacy = metadata.legacy_profile
  if (legacy === undefined || legacy === null) return
  const profile = record(legacy, `${path}.legacy_profile`)
  nullableFields(profile, `${path}.legacy_profile`, ["full_name", "gender", "school", "game_mode"], "string")
  stringArrays(profile, `${path}.legacy_profile`, ["interest_tags", "social_tags"])
  nullableFields(profile, `${path}.legacy_profile`, ["session_count", "compatibility_score"], "number")
  if (profile.match_history !== undefined && profile.match_history !== null) {
    for (const [index, value] of array(profile.match_history, `${path}.legacy_profile.match_history`).entries()) {
      const entry = record(value, `${path}.legacy_profile.match_history[${index}]`)
      if (typeof entry.name !== "string" || typeof entry.count !== "number" || !Number.isFinite(entry.count)) invalid(`${path}.legacy_profile.match_history[${index}]`)
    }
  }
}

function parseSubmissionIdentity(value: unknown, roundId: string, index: number): Row {
  const path = `source.submissions[${index}]`
  const row = record(value, path)
  uuid(row.id, `${path}.id`)
  uuid(row.member_id, `${path}.member_id`)
  if (uuid(row.round_id, `${path}.round_id`) !== roundId) invalid(`${path}.round_id`)
  if (typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) invalid(`${path}.created_at`)
  if (row.cancelled_at !== undefined && row.cancelled_at !== null && (typeof row.cancelled_at !== "string" || !Number.isFinite(Date.parse(row.cancelled_at)))) invalid(`${path}.cancelled_at`)
  return row
}

function validateSubmissionInput(row: Row, index: number) {
  const path = `source.submissions[${index}]`
  if (row.game_type_pref !== null && row.game_type_pref !== undefined && !["双人", "多人", "都可以"].includes(String(row.game_type_pref))) invalid(`${path}.game_type_pref`)
  if (row.gender_pref !== null && row.gender_pref !== undefined && !["男", "女", "都可以"].includes(String(row.gender_pref))) invalid(`${path}.gender_pref`)
  if (row.availability !== null && row.availability !== undefined) {
    for (const [date, slots] of Object.entries(record(row.availability, `${path}.availability`))) strings(slots, `${path}.availability.${date}`)
  }
  stringArrays(row, path, ["interest_tags"])
  nullableFields(row, path, ["social_style"], "string")
  validateMember(row.member, row.member_id as string, `${path}.member`)
  validateImport(row.import_metadata, `${path}.import_metadata`)
}

function parseEligibility(value: unknown, index: number): MatchingRunEligibility {
  const path = `source.eligibility[${index}]`
  const row = record(value, path)
  const member_id = uuid(row.member_id, `${path}.member_id`)
  if (typeof row.eligible !== "boolean" || typeof row.import_exempt !== "boolean") invalid(path)
  const reasons = strings(row.reasons, `${path}.reasons`)
  if (reasons.some((reason) => !reason) || (row.eligible ? reasons.length !== 0 : reasons.length === 0)) invalid(`${path}.reasons`)
  const readiness = row.readiness === null ? null : parseMatchingReadiness(row.readiness)
  if (row.eligible && !row.import_exempt && (!readiness || readiness.missing.length > 0)) invalid(`${path}.readiness`)
  return { member_id, eligible: row.eligible, reasons, readiness, import_exempt: row.import_exempt }
}

function parseHistory(values: unknown): HistoryRow[] {
  return array(values, "source.history_results").map((value, index) => {
    const path = `source.history_results[${index}]`
    const row = record(value, path)
    return {
      id: uuid(row.id, `${path}.id`),
      member_a_id: uuid(row.member_a_id, `${path}.member_a_id`),
      member_b_id: row.member_b_id === null ? null : uuid(row.member_b_id, `${path}.member_b_id`),
      group_members: row.group_members === null ? null : array(row.group_members, `${path}.group_members`).map((id) => uuid(id, `${path}.group_members`)),
    }
  })
}

/** Preserve fetchMatchHistory's first-result deduplication and every group pair. */
function historyMap(rows: HistoryRow[]): Map<string, HistoryEntry[]> {
  const seen = new Set<string>()
  const counts = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    const members = row.group_members?.length ? [...new Set(row.group_members)] : row.member_b_id ? [row.member_a_id, row.member_b_id] : [row.member_a_id]
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        for (const [member, partner] of [[members[i], members[j]], [members[j], members[i]]]) {
          if (!counts.has(member)) counts.set(member, new Map())
          const partners = counts.get(member)!
          partners.set(partner, (partners.get(partner) ?? 0) + 1)
        }
      }
    }
  }
  return new Map([...counts].map(([member, partners]) => [member, [...partners].map(([name, count]) => ({ name, count }))]))
}

function parseBlacklist(value: unknown): BlacklistRecord[] {
  const seen = new Set<string>()
  return array(value, "source.blacklist").flatMap((value, index) => {
    const path = `source.blacklist[${index}]`
    const row = record(value, path)
    const a = uuid(row.member_a_id, `${path}.member_a_id`)
    const b = uuid(row.member_b_id, `${path}.member_b_id`)
    if (row.status !== "blacklist" || (row.notes !== null && typeof row.notes !== "string")) invalid(path)
    const key = [a, b].sort().join("||")
    if (seen.has(key)) return []
    seen.add(key)
    return [{ player_a: a, player_b: b, reason: row.notes as string | null, source: "pair_relationships" }]
  })
}

function parseFeedbacks(value: unknown): FeedbackRecord[] {
  const seen = new Set<string>()
  return array(value, "source.feedbacks").flatMap((value, index) => {
    const path = `source.feedbacks[${index}]`
    const row = record(value, path)
    const a = uuid(row.reviewer_id, `${path}.reviewer_id`)
    const b = uuid(row.reviewee_id, `${path}.reviewee_id`)
    if (row.overall_score !== null && (typeof row.overall_score !== "number" || !Number.isFinite(row.overall_score))) invalid(`${path}.overall_score`)
    // Existing feedback queries keep the first row in each direction. Do not
    // introduce a new chronological preference while capturing their inputs.
    const key = `${a}-${b}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ player_name: a, partner_name: b, partner_rating: row.overall_score as number | null, session_number: 1 }]
  })
}

function assertJson(value: unknown, path = "capture", ancestors = new Set<object>()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (!value || typeof value !== "object" || ancestors.has(value)) invalid(path)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid(path)
  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) assertJson(child, `${path}.${key}`, ancestors)
  ancestors.delete(value)
}

/**
 * Convert the database's immutable, authoritative capture into the existing
 * algorithm inputs. No live reads or active-assignment exclusions occur here.
 */
export function prepareMatchingRunInput(capture: unknown): PreparedMatchingRunInput {
  assertJson(capture)
  const captured = record(structuredClone(capture), "capture")
  const snapshotId = uuid(captured.snapshot_id, "snapshot_id")
  if (typeof captured.captured_at !== "string" || !Number.isFinite(Date.parse(captured.captured_at))) invalid("captured_at")
  const source = record(captured.source, "source")
  const roundId = uuid(record(source.round, "source.round").id, "source.round.id")
  array(source.questionnaire_refs, "source.questionnaire_refs")
  const allSubmissions = array(source.submissions, "source.submissions").map((row, index) => parseSubmissionIdentity(row, roundId, index))
  const eligibility = array(source.eligibility, "source.eligibility").map(parseEligibility)
  const byMember = new Map(eligibility.map((row) => [row.member_id, row]))
  const memberIds = new Set(allSubmissions.map((row) => row.member_id as string))
  if (memberIds.size !== allSubmissions.length || byMember.size !== eligibility.length || eligibility.length !== allSubmissions.length || eligibility.some((row) => !memberIds.has(row.member_id))) invalid("source.eligibility membership")
  const submissions: Row[] = []
  for (const [index, row] of allSubmissions.entries()) {
    if (!byMember.get(row.member_id as string)!.eligible) continue
    if (!row.member) invalid("eligible submission member")
    // A rejected historical row is retained by the database capture, but its
    // unused old answers/profile must not prevent eligible members from running.
    validateSubmissionInput(row, index)
    submissions.push(row)
  }
  const histories = historyMap(parseHistory(source.history_results))
  const pairRelations = buildPairRelations(parseFeedbacks(source.feedbacks), parseBlacklist(source.blacklist), histories)
  const candidates = submissions.map((sub) => submissionToCandidate(sub, sub.member as Row, mergeMatchHistory(histories.get(sub.member_id as string) ?? [], getImportedHistory(sub.import_metadata))))
  const idMap = new Map(submissions.map((sub) => [sub.member_id as string, sub.member_id as string]))
  const config = structuredClone(DEFAULT_CONFIG)
  const engineInput: MatchingEngineInput = structuredClone({
    candidates,
    pairRelations: [...pairRelations],
    idMap: [...idMap],
    config,
    algorithm_version: MATCHING_ENGINE_ALGORITHM_VERSION,
    adapter_version: MATCHING_RUN_ADAPTER_VERSION,
  })
  return { snapshotId, capturedAt: captured.captured_at, submissions, candidates, pairRelations, idMap, config, engineInput, exclusions: eligibility.filter((row) => !row.eligible) }
}
