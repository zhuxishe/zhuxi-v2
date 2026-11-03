import type { BoardDisplayRow, BoardDraft } from "./board-types"

/** Safe to import from browser code; server-only signing lives in board-csv.ts. */
export const MAX_BOARD_CSV_BYTES = 1_500_000
export const BOARD_CSV_HEADERS = ["玩家标识（勿改）", "会员编号", "姓名", "玩家性别", "目标池", "组号", "多人分组栏", "推荐日期", "推荐时段", "模板信息（勿改）"] as const
export interface BoardCsvPerson { id: string; name: string; memberNumber: string | null; gender: string | null }
export interface BoardCsvIssue { row?: number; group?: string; member?: string; message: string }
export interface BoardCsvCounts { duoGroups: number; multiGroups: number; matched: number; unmatched: number; waitingDuo: number; waitingMulti: number }
export interface BoardCsvChange { memberId: string; name: string; before: string; after: string }
export interface BoardCsvPreview {
  draft: BoardDraft
  rows: BoardDisplayRow[]
  revisionToken: string
  unchanged: boolean
  summary: { before: BoardCsvCounts; after: BoardCsvCounts; changedMembers: number; createdGroups: number; removedGroups: number; changedTimes: number }
  changes: BoardCsvChange[]
}
export interface BoardCsvPreviewResult { success?: true; error?: string; stale?: boolean; errors?: BoardCsvIssue[]; warnings?: string[]; preview?: BoardCsvPreview }
export interface BoardCsvRecord { cells: string[]; row: number }
export interface BoardCsvAssignment { memberId: string; row: number; pool: "双人" | "多人" | "未匹配"; groupCode: string; section: "small" | "time" | null; slot: string | null }

