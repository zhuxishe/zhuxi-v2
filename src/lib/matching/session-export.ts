import ExcelJS from "exceljs"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildRoundSubmissionSelect, supportsImportMetadataColumn } from "./import-metadata-column"
import { getImportMetadata, getImportedSource } from "./import-metadata"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchMatchingInputSnapshot, selectSessionSubmissionInputs, sessionSubmissionInputLabel } from "./input-snapshot-reader"

function memberSlots(row: any): string[] {
  if (Array.isArray(row.group_members) && row.group_members.length > 0) return row.group_members
  return [row.member_a_id, row.member_b_id].filter(Boolean)
}

function detailText(value: unknown): string {
  if (typeof value === "string") return value
  if (value == null) return ""
  return JSON.stringify(value)
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-")
}

function appendSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: string[],
  rows: Array<Record<string, string | number | null>>,
) {
  const sheet = workbook.addWorksheet(name)
  sheet.addRow(columns)
  rows.forEach((row) => sheet.addRow(columns.map((column) => row[column] ?? "")))
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

  const allMemberIds = new Set<string>()
  for (const row of [...(results ?? []), ...(diagnostics ?? [])]) {
    for (const memberId of memberSlots(row)) allMemberIds.add(memberId)
    if (row.member_id) allMemberIds.add(row.member_id)
  }
  const originalIds = new Set(inputSnapshot?.engine_input.candidates.map((row) => row.submissionId) ?? [])
  const adjustmentIds = [...allMemberIds].filter((memberId) => !originalIds.has(memberId))
  let liveSubmissions: any[] = []
  if (session.round_id && inputSnapshot?.status !== "redacted" && (inputSnapshot === null || adjustmentIds.length > 0)) {
    const includeImportMetadata = await supportsImportMetadataColumn(db)
    let query = db
      .from("match_round_submissions")
      .select(buildRoundSubmissionSelect(includeImportMetadata))
      .eq("round_id", session.round_id)
    if (inputSnapshot !== null) query = query.in("member_id", adjustmentIds)
    const { data: submissions, error: submissionError } = await query
    if (submissionError) throw submissionError
    liveSubmissions = submissions ?? []
  }
  const { rows: inputRows } = selectSessionSubmissionInputs(inputSnapshot, liveSubmissions, allMemberIds)
  const submissionMap = new Map<string, any>(inputRows.map((row) => [row.member_id, row]))
  const roundName = Array.isArray(session.round) ? session.round[0]?.round_name ?? "" : session.round?.round_name ?? ""
  const memberNames = new Map<string, string>()
  if (allMemberIds.size > 0) {
    const { data: members } = await db
      .from("members")
      .select("id, member_identity(full_name, nickname)")
      .in("id", [...allMemberIds])
    for (const row of members ?? []) {
      const identity = Array.isArray(row.member_identity) ? row.member_identity[0] : row.member_identity
      memberNames.set(row.id, identity?.full_name ?? identity?.nickname ?? row.id)
    }
  }

  const memberSlotCount = (results ?? []).reduce((count: number, row: any) => Math.max(count, memberSlots(row).length), 6)
  const resultRows = (results ?? []).map((row: any) => {
    const slots = memberSlots(row)
    const exportRow: Record<string, string | number | null> = {
      rank: row.rank ?? "",
      session_status: session.status,
      result_status: row.status,
      group_type: slots.length > 2 ? "多人" : "双人",
      group_size: slots.length,
      best_slot: row.best_slot ?? "",
      total_score: row.total_score ?? "",
      round_name: roundName,
      input_source: slots.some((memberId) => sessionSubmissionInputLabel(inputSnapshot, memberId) === "后续人工调整当前资料")
        ? "含后续人工调整当前资料" : sessionSubmissionInputLabel(inputSnapshot, slots[0] ?? ""),
      captured_at: inputSnapshot?.captured_at ?? "",
    }
    for (let index = 0; index < memberSlotCount; index++) {
      const memberId = slots[index] ?? ""
      exportRow[`member_${index + 1}_name`] = memberNames.get(memberId) ?? ""
      exportRow[`member_${index + 1}_id`] = memberId
      exportRow[`member_${index + 1}_source`] = getImportedSource(submissionMap.get(memberId)?.import_metadata) ?? ""
    }
    return exportRow
  })

  const unmatchedRows = (diagnostics ?? []).map((row: any) => {
    const submission = submissionMap.get(row.member_id)
    const metadata = getImportMetadata(submission?.import_metadata)
    return {
      name: memberNames.get(row.member_id) ?? row.member_id,
      member_id: row.member_id,
      source: metadata?.source ?? "",
      normalized_game_type_pref: submission?.game_type_pref ?? "",
      raw_first_choice: metadata?.raw_first_choice ?? "",
      raw_second_choice: metadata?.raw_second_choice ?? "",
      gender_pref: submission?.gender_pref ?? "",
      diagnostic_reason: row.reason,
      diagnostic_details: detailText(row.details),
      notes: submission?.message ?? metadata?.raw_notes ?? "",
      input_source: sessionSubmissionInputLabel(inputSnapshot, row.member_id),
      captured_at: inputSnapshot?.captured_at ?? "",
    }
  })

  const resultColumns = [
    "rank", "session_status", "result_status", "group_type", "group_size", "best_slot", "total_score", "round_name",
    ...Array.from({ length: 6 }, (_, index) => `member_${index + 1}_name`),
    ...Array.from({ length: 6 }, (_, index) => `member_${index + 1}_id`),
    ...Array.from({ length: 6 }, (_, index) => `member_${index + 1}_source`),
    "input_source", "captured_at",
    ...Array.from({ length: memberSlotCount - 6 }, (_, index) => {
      const memberNumber = index + 7
      return [`member_${memberNumber}_name`, `member_${memberNumber}_id`, `member_${memberNumber}_source`]
    }).flat(),
  ]
  const unmatchedColumns = [
    "name", "member_id", "source", "normalized_game_type_pref", "raw_first_choice", "raw_second_choice",
    "gender_pref", "diagnostic_reason", "diagnostic_details", "notes", "input_source", "captured_at",
  ]
  const workbook = new ExcelJS.Workbook()
  appendSheet(workbook, "配对结果", resultColumns, resultRows)
  appendSheet(workbook, "未匹配名单", unmatchedColumns, unmatchedRows)
  const name = session.session_name ?? roundName ?? sessionId
  const date = new Date().toISOString().slice(0, 10)
  const rawBuffer = await workbook.xlsx.writeBuffer()
  return {
    buffer: Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer),
    fileName: `${safeFileName(name)}-${date}.xlsx`,
  }
}
