import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { validateUuids } from "@/lib/sanitize"
import { createBoardDraft, type BoardContext } from "./board-engine"
import { redactBoardRows } from "./board-service"
import { createBoardCsvTemplate } from "./board-csv"
import { previewBoardCsvText } from "./board-csv-engine"
import { MAX_BOARD_CSV_BYTES, type BoardCsvPerson, type BoardCsvPreviewResult } from "./board-csv-types"
import { prepareMatchingRunInput } from "./run-input"
import { buildSavedMatchingReview, savedMatchingReviewWorkbookData, type SavedReviewCapture } from "./session-review"

interface CsvCapture extends SavedReviewCapture {
  session_id: string
  round_id: string
  read_only?: boolean
  results_ready?: boolean
  locked_member_ids?: string[]
}

export class MatchingBoardCsvError extends Error {
  constructor(message: string, readonly status = 400, readonly stale = false) { super(message) }
}

function signingKey() {
  // Reuse the existing server credential for a domain-separated HMAC only.
  // The credential is never included in a template, response or client bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || key.length < 16) throw new MatchingBoardCsvError("调整模板暂时不可用，请稍后重试。", 503)
  return key
}

async function savedSource(sessionId: string, expectedRevision: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") throw new MatchingBoardCsvError("仅超级管理员可下载或上传人工调整CSV。", 403)
  try { validateUuids([sessionId]) } catch { throw new MatchingBoardCsvError("匹配批次编号无效。") }
  if (typeof expectedRevision !== "string" || !expectedRevision.length || expectedRevision.length > 1000) throw new MatchingBoardCsvError("缺少有效方案版本，请重新读取匹配详情后再操作。", 409, true)
  const db = createAdminClient() as unknown as {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: CsvCapture | null; error: unknown }>
  }
  const { data, error } = await db.rpc("admin_get_matching_board", { p_session_id: sessionId, p_actor_admin_id: admin.id })
  if (error || !data) throw new MatchingBoardCsvError("暂时无法读取完整的已保存方案，请稍后重试。")
  if (data.session_id !== sessionId || typeof data.round_id !== "string" || !Array.isArray(data.results)
    || !Array.isArray(data.cohort_member_ids) || !data.cohort_member_ids.length || data.cohort_member_ids.length > 10000
    || new Set(data.cohort_member_ids).size !== data.cohort_member_ids.length) throw new MatchingBoardCsvError("批次资料不完整，无法生成或校验调整模板。")
  try { validateUuids([data.round_id, ...data.cohort_member_ids]) } catch { throw new MatchingBoardCsvError("批次人员标识无效，请重新读取后核对。") }
  if (data.session_status !== "draft" || data.read_only === true || data.results_ready === false) throw new MatchingBoardCsvError("当前方案不能导入调整；已发布方案须先由管理员明确撤回。", 409, true)
  if (data.base_revision !== expectedRevision) throw new MatchingBoardCsvError("方案、报名资料或锁定已变化，请重新下载调整模板。", 409, true)
  const draft = createBoardDraft(data.results, data.cohort_member_ids, data.layout)
  const review = buildSavedMatchingReview(sessionId, data, true)
  const workbook = savedMatchingReviewWorkbookData(data, review)
  const people: BoardCsvPerson[] = workbook.members.map((member) => ({ id: member.id,
    name: member.member_identity.full_name, memberNumber: member.member_number,
    gender: member.anonymized_at ? null : member.member_identity.gender }))
  if (people.length !== data.cohort_member_ids.length || people.some((person) => !data.cohort_member_ids.includes(person.id))) throw new MatchingBoardCsvError("人员名单无法完整对应，暂不能使用CSV调整。")
  return { data, draft, people, review }
}

/** Read-only export of the exact saved board; no operation, upload or storage row is created. */
export async function buildMatchingBoardCsvTemplate(sessionId: string, expectedRevision: string, expectedPublicationSignature?: string) {
  const source = await savedSource(sessionId, expectedRevision)
  if (expectedPublicationSignature !== undefined && source.review.publicationSignature !== expectedPublicationSignature) throw new MatchingBoardCsvError("发布前核对内容已变化，请重新读取匹配详情后再下载模板。", 409, true)
  return createBoardCsvTemplate({ sessionId, revision: source.data.base_revision, draft: source.draft, people: source.people }, signingKey())
}

export interface MatchingBoardCsvRequest { sessionId: string; expectedRevision: string; csvText: string }

function safeError(error: unknown): BoardCsvPreviewResult {
  if (error instanceof MatchingBoardCsvError) return { error: error.message, ...(error.stale ? { stale: true } : {}) }
  return { error: "暂时无法校验人工调整CSV，请核对文件并稍后重试。" }
}

/** Shared by preview and apply: applying still only returns a freshly validated local draft. */
async function inspectCsv(input: MatchingBoardCsvRequest): Promise<BoardCsvPreviewResult> {
  try {
    // Authorization precedes reading any source or returning CSV details.
    const source = await savedSource(input.sessionId, input.expectedRevision)
    if (typeof input.csvText !== "string" || !input.csvText.length || Buffer.byteLength(input.csvText, "utf8") > MAX_BOARD_CSV_BYTES) throw new MatchingBoardCsvError("请选择有效的UTF-8 CSV文件，文件大小须不超过1.5MB。")
    const context: BoardContext = { engine: prepareMatchingRunInput(source.data.capture).engineInput,
      originalRows: source.data.results, cohortMemberIds: source.data.cohort_member_ids,
      lockedMemberIds: source.data.locked_member_ids ?? [], originalLayout: source.data.layout }
    const result = previewBoardCsvText({ sessionId: input.sessionId, revision: source.data.base_revision,
      draft: source.draft, people: source.people, context, csvText: input.csvText }, signingKey())
    return result.preview ? { ...result, preview: { ...result.preview, rows: redactBoardRows(result.preview.rows, true) } } : result
  } catch (error) { return safeError(error) }
}

export async function previewMatchingBoardCsv(input: MatchingBoardCsvRequest) { return inspectCsv(input) }
export async function applyMatchingBoardCsv(input: MatchingBoardCsvRequest) { return inspectCsv(input) }
