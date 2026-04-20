import * as XLSX from "xlsx"
import { createAdminClient } from "@/lib/supabase/admin"
import { getImportMetadata, getImportedSource } from "./import-metadata"

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

export async function buildSessionExportWorkbook(sessionId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const db = createAdminClient() as any
  const { data: session, error: sessionError } = await db
    .from("match_sessions")
    .select("id, session_name, status, round_id, round:match_rounds(round_name)")
    .eq("id", sessionId)
    .single()
  if (sessionError || !session) throw new Error("匹配会话不存在")

  const [{ data: results, error: resultError }, { data: diagnostics, error: diagnosticError }] = await Promise.all([
    db.from("match_results").select("*").eq("session_id", sessionId).order("rank", { ascending: true }),
    db.from("unmatched_diagnostics").select("*").eq("session_id", sessionId),
  ])
  if (resultError) throw resultError
  if (diagnosticError) throw diagnosticError

  const submissionMap = new Map<string, any>()
  if (session.round_id) {
    const { data: submissions, error: submissionError } = await db
      .from("match_round_submissions")
      .select("member_id, game_type_pref, gender_pref, message, import_metadata")
      .eq("round_id", session.round_id)
    if (submissionError) throw submissionError
    for (const row of submissions ?? []) submissionMap.set(row.member_id, row)
  }

  const allMemberIds = new Set<string>()
  for (const row of [...(results ?? []), ...(diagnostics ?? [])]) {
    for (const memberId of memberSlots(row)) allMemberIds.add(memberId)
    if (row.member_id) allMemberIds.add(row.member_id)
  }
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
    }
    for (let index = 0; index < 6; index++) {
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
    }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resultRows), "配对结果")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unmatchedRows), "未匹配名单")
  const name = session.session_name ?? roundName ?? sessionId
  const date = new Date().toISOString().slice(0, 10)
  return {
    buffer: XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }),
    fileName: `${safeFileName(name)}-${date}.xlsx`,
  }
}
