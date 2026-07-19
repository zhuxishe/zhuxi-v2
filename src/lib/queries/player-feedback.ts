import { createAdminClient } from "@/lib/supabase/admin"
import type { PlayerFeedbackRow, PlayerFeedbackStatus } from "@/types/player-feedback"

export interface PlayerFeedbackAdminState {
  feedback: PlayerFeedbackRow[]
  setupRequired: boolean
  total: number
  page: number
  pageSize: number
}

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01"
}

export async function fetchPlayerFeedbackAdminState(
  status?: PlayerFeedbackStatus,
  requestedPage = 1,
): Promise<PlayerFeedbackAdminState> {
  const pageSize = 50
  const page = Math.max(1, Math.floor(requestedPage))
  const from = (page - 1) * pageSize
  const supabase = createAdminClient()
  let query = supabase
    .from("player_feedback")
    .select("id, member_id, member_name_snapshot, category, content, page_path, locale, status, admin_note, completed_at, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1)
  if (status) query = query.eq("status", status)

  const { data, count, error } = await query
  if (error && isMissingTable(error)) {
    return { feedback: [], setupRequired: true, total: 0, page, pageSize }
  }
  if (error) {
    console.error("[fetchPlayerFeedbackAdminState]", error)
    throw new Error("玩家反馈读取失败")
  }
  return {
    feedback: (data ?? []) as PlayerFeedbackRow[],
    setupRequired: false,
    total: count ?? 0,
    page,
    pageSize,
  }
}
