import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"

export type SnapshotSubmissionRow = Record<string, unknown> & { member_id: string }

export interface MatchingInputSnapshot {
  snapshot_id: string
  captured_at: string
  status: "sealed" | "redacted"
  source: { submissions: SnapshotSubmissionRow[]; eligibility?: Array<{ eligible: boolean; reasons: string[] }> }
  engine_input: { candidates: Array<{ submissionId: string }> }
  submitted_count?: number
  eligible_count?: number
  excluded_count?: number
}

export interface MatchingSessionInputSource {
  kind: "snapshot" | "redacted" | "live"
  capturedAt?: string
  manualAdjustmentCount?: number
  submittedCount?: number
  eligibleCount?: number
  excludedCount?: number
  exclusionSummary?: string[]
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Service-role input stays server-side; callers must project any client DTOs. */
export async function fetchMatchingInputSnapshot(sessionId: string): Promise<MatchingInputSnapshot | null> {
  const admin = await requireAdmin()
  const db = createAdminClient() as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  }
  const { data, error } = await db.rpc("admin_read_matching_input", {
    p_session_id: sessionId, p_actor_admin_id: admin.id,
  })
  if (error) throw error
  if (data === null || (object(data) && data.legacy === true && data.status === "legacy" && !data.snapshot_id)) return null
  if (!object(data) || typeof data.snapshot_id !== "string" || typeof data.captured_at !== "string"
    || (data.status !== "sealed" && data.status !== "redacted")) {
    throw new Error("无法读取本批次输入快照")
  }
  if (data.status === "redacted") {
    // A privacy-redacted snapshot must never be reconstructed from current data.
    return { snapshot_id: data.snapshot_id, captured_at: data.captured_at, status: "redacted",
      source: { submissions: [] }, engine_input: { candidates: [] },
      submitted_count: typeof data.submitted_count === "number" ? data.submitted_count : undefined,
      eligible_count: typeof data.eligible_count === "number" ? data.eligible_count : undefined,
      excluded_count: typeof data.excluded_count === "number" ? data.excluded_count : undefined }
  }
  if (!object(data.source) || !Array.isArray(data.source.submissions)
    || !object(data.engine_input) || !Array.isArray(data.engine_input.candidates)
    || !data.source.submissions.every((row) => object(row) && typeof row.member_id === "string")
    || !data.engine_input.candidates.every((row) => object(row) && typeof row.submissionId === "string")) {
    throw new Error("本批次输入快照不完整")
  }
  return data as unknown as MatchingInputSnapshot
}

export function matchingSessionInputSource(snapshot: MatchingInputSnapshot | null): MatchingSessionInputSource {
  if (snapshot === null) return { kind: "live" }
  const labels: Record<string, string> = {
    cancelled: "已取消报名", member_not_approved: "审核未通过", anonymized: "已匿名化", not_player: "非玩家身份",
    account_unavailable: "账号不可用", not_current: "非当前成员", unbound: "未绑定账号", profile_incomplete: "必需资料不完整",
  }
  const reasons = new Map<string, number>()
  for (const row of snapshot.source.eligibility ?? []) {
    if (row.eligible || !Array.isArray(row.reasons)) continue
    for (const reason of new Set(row.reasons)) {
      const label = labels[reason] ?? "其他资格问题"
      reasons.set(label, (reasons.get(label) ?? 0) + 1)
    }
  }
  return { kind: snapshot.status === "redacted" ? "redacted" : "snapshot", capturedAt: snapshot.captured_at,
    submittedCount: snapshot.submitted_count ?? snapshot.source.submissions.length,
    eligibleCount: snapshot.eligible_count ?? snapshot.engine_input.candidates.length,
    excludedCount: snapshot.excluded_count ?? snapshot.source.submissions.length - snapshot.engine_input.candidates.length,
    exclusionSummary: [...reasons].map(([reason, count]) => `${reason} ${count} 人`) }
}

/** Initial algorithm cohort only; later submissions never enter its heatmap. */
export function snapshotSubmissionRows(snapshot: MatchingInputSnapshot): SnapshotSubmissionRow[] {
  if (snapshot.status === "redacted") return []
  const candidateIds = new Set(snapshot.engine_input.candidates.map((candidate) => candidate.submissionId))
  return snapshot.source.submissions.filter((row) => candidateIds.has(row.member_id))
}

export function selectSessionSubmissionInputs(
  snapshot: MatchingInputSnapshot | null,
  liveRows: SnapshotSubmissionRow[],
  savedMemberIds: Iterable<string>,
): { rows: SnapshotSubmissionRow[]; initialRows: SnapshotSubmissionRow[]; source: MatchingSessionInputSource } {
  const source = matchingSessionInputSource(snapshot)
  if (snapshot === null) return { rows: liveRows, initialRows: liveRows, source }
  if (snapshot.status === "redacted") return { rows: [], initialRows: [], source }
  const initialRows = snapshotSubmissionRows(snapshot)
  const originalIds = new Set(initialRows.map((row) => row.member_id))
  const savedIds = new Set(savedMemberIds)
  const adjustments = liveRows.filter((row) => savedIds.has(row.member_id) && !originalIds.has(row.member_id))
  return { rows: [...initialRows, ...adjustments], initialRows,
    source: { ...source, manualAdjustmentCount: adjustments.length } }
}

export function sessionSubmissionInputLabel(snapshot: MatchingInputSnapshot | null, memberId: string): string {
  if (snapshot === null) return "历史批次当前资料（无快照）"
  if (snapshot.status === "redacted") return "输入快照已脱敏"
  return snapshot.engine_input.candidates.some((row) => row.submissionId === memberId)
    ? "初始批次输入快照" : "后续人工调整当前资料"
}
