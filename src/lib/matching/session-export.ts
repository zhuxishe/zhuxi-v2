import { createAdminClient } from "@/lib/supabase/admin"
import { buildRoundSubmissionSelect, supportsImportMetadataColumn } from "./import-metadata-column"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchingInputSnapshot, selectSessionSubmissionInputs } from "./input-snapshot-reader"
import { createSessionExportWorkbook, exportCohortIds } from "./session-export-workbook"

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-")
}

export async function buildSessionExportWorkbook(sessionId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") {
    throw new Error("仅超级管理员可导出原始匹配数据")
  }
  const db = createAdminClient() as any
  const { data: session, error: sessionError } = await db
    .from("match_sessions")
    .select("id, session_name, status, round_id, round:match_rounds(round_name)")
    .eq("id", sessionId)
    .single()
  if (sessionError || !session) throw new Error("匹配会话不存在")

  const [{ data: results, error: resultError }, { data: diagnostics, error: diagnosticError }, inputSnapshot] = await Promise.all([
    db.from("match_results").select("*").eq("session_id", sessionId).order("rank", { ascending: true }),
    db.from("unmatched_diagnostics").select("*").eq("session_id", sessionId),
    fetchMatchingInputSnapshot(sessionId),
  ])
  if (resultError) throw resultError
  if (diagnosticError) throw diagnosticError

  const allMemberIds = new Set(exportCohortIds(results ?? [], diagnostics ?? [], inputSnapshot))
  const originalIds = new Set(inputSnapshot?.engine_input.candidates.map((row) => row.submissionId) ?? [])
  const adjustmentIds = [...allMemberIds].filter((memberId) => !originalIds.has(memberId))
  let liveSubmissions: any[] = []
  if (session.round_id && inputSnapshot?.status !== "redacted" && (inputSnapshot === null || adjustmentIds.length > 0)) {
    const includeImportMetadata = await supportsImportMetadataColumn(db)
    let query = db
      .from("match_round_submissions")
      .select(`${buildRoundSubmissionSelect(includeImportMetadata)}, availability`)
      .eq("round_id", session.round_id)
    if (inputSnapshot !== null) query = query.in("member_id", adjustmentIds)
    const { data: submissions, error: submissionError } = await query
    if (submissionError) throw submissionError
    liveSubmissions = submissions ?? []
  }
  const { rows: inputRows } = selectSessionSubmissionInputs(inputSnapshot, liveSubmissions, allMemberIds)
  const roundName = Array.isArray(session.round) ? session.round[0]?.round_name ?? "" : session.round?.round_name ?? ""
  let members: any[] = []
  if (allMemberIds.size > 0) {
    const { data, error } = await db
      .from("members")
      .select("id, member_number, member_identity(full_name, nickname)")
      .in("id", [...allMemberIds])
    if (error) throw error
    members = data ?? []
  }
  const workbook = createSessionExportWorkbook({ results: results ?? [], diagnostics: diagnostics ?? [],
    members, submissions: inputRows, snapshot: inputSnapshot })
  const name = session.session_name ?? roundName ?? sessionId
  const date = new Date().toISOString().slice(0, 10)
  const rawBuffer = await workbook.xlsx.writeBuffer()
  return {
    buffer: Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer),
    fileName: `${safeFileName(name)}-${date}.xlsx`,
  }
}
