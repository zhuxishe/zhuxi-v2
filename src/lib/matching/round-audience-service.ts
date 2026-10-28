import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import type { RoundAudienceMember, RoundAudienceOperationSummary, RoundAudienceSaveInput, RoundAudienceSaveResult, RoundAudienceSnapshot } from "./round-audience-types"

type RpcError = { code?: string; message?: string }
type RpcClient = { rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError | null }> }
interface Receipt {
  operationId: string
  roundId: string
  revision: string
  enabled: boolean
  listedCount: number
  alreadyApplied: boolean
  expectedRevision: string
  memberIds: string[]
  reason: string
  actorAdminId: string
}

const MAX_MEMBERS = 5000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown, max = 1000): value is string => typeof value === "string" && value.length > 0 && value.length <= max
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000000
const invalidRead = () => new Error("无法读取完整参与范围，请刷新后重试。")
const conflict = "此操作编号已用于其他调整，请保留原请求并核对保存结果。"
const unknown = (operationId: string, message = "保存结果暂时无法确认，请保留当前调整并使用原操作编号核对，避免重复保存。"): RoundAudienceSaveResult => ({ error: message, operationId, unknown: true })

/** Only display metadata is allowed to leave the authenticated server query. */
function parseSnapshot(value: unknown, roundId: string, isSuperAdmin: boolean): RoundAudienceSnapshot {
  if (!object(value) || !uuid(value.roundId) || value.roundId.toLowerCase() !== roundId
    || !text(value.roundName, 500) || !text(value.purpose, 60) || !text(value.status, 60)
    || typeof value.isTest !== "boolean" || typeof value.canManage !== "boolean" || typeof value.enabled !== "boolean"
    || !text(value.revision) || !Array.isArray(value.members) || value.members.length > MAX_MEMBERS
    || !object(value.counts) || !["listed", "effective", "formal", "test"].every((key) => count(value.counts && (value.counts as Record<string, unknown>)[key]))
    || !Array.isArray(value.operations) || value.operations.length > 100) throw invalidRead()
  const members: RoundAudienceMember[] = value.members.map((member) => {
    if (!object(member) || !uuid(member.id) || !text(member.name, 500)
      || !(member.memberNumber === null || text(member.memberNumber, 100))
      || ["isTest", "listed", "participated", "eligible"].some((key) => typeof member[key] !== "boolean")) throw invalidRead()
    return { id: member.id.toLowerCase(), name: member.name, memberNumber: member.memberNumber,
      isTest: member.isTest as boolean, listed: member.listed as boolean, participated: member.participated as boolean, eligible: member.eligible as boolean }
  })
  if (new Set(members.map((member) => member.id)).size !== members.length) throw invalidRead()
  const counts = value.counts as RoundAudienceSnapshot["counts"]
  if (counts.listed !== members.filter((member) => member.listed).length || counts.effective !== counts.formal + counts.test) throw invalidRead()
  const operations: RoundAudienceOperationSummary[] = value.operations.map((operation) => {
    if (!object(operation) || !uuid(operation.operationId) || !text(operation.createdAt, 100) || !Number.isFinite(Date.parse(operation.createdAt))
      || !text(operation.actorName, 500) || typeof operation.enabled !== "boolean" || !count(operation.listedCount)) throw invalidRead()
    return { operationId: operation.operationId.toLowerCase(), createdAt: operation.createdAt, actorName: operation.actorName,
      enabled: operation.enabled, listedCount: operation.listedCount }
  })
  return { roundId, roundName: value.roundName, isTest: value.isTest, purpose: value.purpose, status: value.status,
    canManage: isSuperAdmin && value.canManage && value.isTest && value.purpose === "matching", enabled: value.enabled, revision: value.revision,
    members: isSuperAdmin ? members : members.filter((member) => member.listed || member.participated),
    counts: { listed: counts.listed, effective: counts.effective, formal: counts.formal, test: counts.test }, operations }
}

function errorMessage(error: unknown): string {
  const message = object(error) && typeof error.message === "string" ? error.message : ""
  if (/ROUND_AUDIENCE_.*FORBIDDEN|42501/.test(message)) return "仅超级管理员可以修改参与范围。"
  if (/ROUND_AUDIENCE_(NOT_FOUND|DELETED|ROUND_UNAVAILABLE)/.test(message)) return "该活动已删除或不存在，请返回匹配管理核对。"
  if (/ROUND_AUDIENCE_(READ_ONLY|NOT_TEST)/.test(message)) return "此活动的参与范围不可在这里修改；正式活动沿用正常正式玩家范围。"
  if (/ROUND_AUDIENCE_(STALE|CHANGED|REVISION)/.test(message)) return "活动、名单或参与记录已变化，本次未保存。请重新载入后核对。"
  if (/ROUND_AUDIENCE_BUSY|TEST_ROUND_AUDIENCE_BUSY/.test(message)) return "本期正在执行其他操作，请稍后重新载入范围再试。"
  if (/ROUND_AUDIENCE_(PARTICIPANTS_REQUIRED|PROTECTED|MEMBERS_REQUIRED)|TEST_ROUND_AUDIENCE_PARTICIPANTS_EXIST/.test(message)) return "已有参与记录的成员必须保留在指定名单中，请先保留这些成员再保存。"
  if (/ROUND_AUDIENCE_INELIGIBLE/.test(message)) return "部分新增成员当前不符合参与条件，请重新载入并核对名单。"
  if (/ROUND_AUDIENCE_OPERATION_CONFLICT|TEST_ROUND_AUDIENCE_OPERATION_CONFLICT/.test(message)) return conflict
  if (/ROUND_AUDIENCE_(INPUT_INVALID|REASON_INVALID|MEMBERS_INVALID)/.test(message)) return "参与范围、名单或操作理由无效，请核对后重试。"
  const code = object(error) && typeof error.code === "string" ? error.code : ""
  if (code === "42501") return "没有权限修改参与范围，请核对当前登录账号。"
  if (["PGRST202", "42883"].includes(code)) return "参与范围管理尚未完成数据库升级，请稍后重试。"
  return "暂时无法处理参与范围，请稍后重试。"
}

function definiteRejection(error: unknown) {
  if (!object(error)) return false
  return (typeof error.message === "string" && /^(ROUND_AUDIENCE_|TEST_ROUND_AUDIENCE_)/.test(error.message))
    || ["22023", "42501", "22P02", "PT409", "23505", "23503"].includes(String(error.code ?? ""))
}

function parseInput(input: RoundAudienceSaveInput): RoundAudienceSaveInput {
  if (!object(input) || !uuid(input.roundId) || !uuid(input.operationId) || typeof input.enabled !== "boolean"
    || !text(input.expectedRevision) || typeof input.reason !== "string" || !Array.isArray(input.memberIds)
    || input.memberIds.length > MAX_MEMBERS || !input.memberIds.every(uuid)) throw new Error("INPUT_INVALID")
  const memberIds = input.memberIds.map((id) => id.toLowerCase()).sort()
  if (new Set(memberIds).size !== memberIds.length) throw new Error("INPUT_INVALID")
  const reason = normalizeAdminAuditReason(input.reason)
  if (!reason.ok) throw new Error("INPUT_INVALID")
  return { roundId: input.roundId.toLowerCase(), operationId: input.operationId.toLowerCase(), enabled: input.enabled,
    memberIds, expectedRevision: input.expectedRevision, reason: reason.reason }
}

function parseReceipt(value: unknown): Receipt {
  if (!object(value) || !uuid(value.operationId) || !uuid(value.roundId) || !uuid(value.actorAdminId)
    || !text(value.revision) || !text(value.expectedRevision) || typeof value.enabled !== "boolean" || typeof value.alreadyApplied !== "boolean"
    || !count(value.listedCount) || !Array.isArray(value.memberIds) || value.memberIds.length > MAX_MEMBERS
    || !value.memberIds.every(uuid) || !text(value.reason, 2000)) throw new Error("RECEIPT_INVALID")
  const memberIds = value.memberIds.map((id) => id.toLowerCase()).sort()
  if (new Set(memberIds).size !== memberIds.length || value.listedCount !== memberIds.length) throw new Error("RECEIPT_INVALID")
  return { operationId: value.operationId.toLowerCase(), roundId: value.roundId.toLowerCase(), actorAdminId: value.actorAdminId.toLowerCase(),
    revision: value.revision, expectedRevision: value.expectedRevision, enabled: value.enabled, listedCount: value.listedCount,
    alreadyApplied: value.alreadyApplied, memberIds, reason: value.reason }
}

async function receipt(db: RpcClient, operationId: string): Promise<Receipt | null> {
  const { data, error } = await db.rpc<unknown>("admin_get_round_audience_operation", { p_operation_id: operationId })
  if (error) throw error
  return data === null ? null : parseReceipt(data)
}

function confirmed(value: Receipt, input: RoundAudienceSaveInput, actorAdminId: string): RoundAudienceSaveResult {
  if (value.operationId !== input.operationId || value.roundId !== input.roundId || value.actorAdminId !== actorAdminId.toLowerCase()
    || value.enabled !== input.enabled || value.expectedRevision !== input.expectedRevision || value.reason !== input.reason
    || value.memberIds.length !== input.memberIds.length || value.memberIds.some((id, index) => id !== input.memberIds[index])) {
    return { error: conflict, operationId: input.operationId }
  }
  for (const path of ["/admin/matching", `/admin/matching/rounds/${input.roundId}`, `/admin/matching/rounds/${input.roundId}/edit`, "/app/matching", "/app/matching/survey", "/app/matches"]) revalidatePath(path)
  return { success: true, operationId: input.operationId, revision: value.revision }
}

export async function fetchRoundAudience(roundId: string): Promise<RoundAudienceSnapshot> {
  const admin = await requireAdmin()
  if (!uuid(roundId)) throw invalidRead()
  const db = await createClient() as unknown as RpcClient
  const { data, error } = await db.rpc<unknown>("admin_get_round_audience", { p_round_id: roundId.toLowerCase() })
  if (error) throw new Error(errorMessage(error))
  return parseSnapshot(data, roundId.toLowerCase(), admin.role === "super_admin")
}

export async function saveRoundAudienceConfiguration(rawInput: RoundAudienceSaveInput): Promise<RoundAudienceSaveResult> {
  const admin = await requireAdmin()
  let input: RoundAudienceSaveInput
  try { input = parseInput(rawInput) } catch { return { error: "请核对活动、名单及操作编号，并填写 4–500 个字符的操作理由。" } }
  let db: RpcClient
  try { db = await createClient() as unknown as RpcClient } catch { return unknown(input.operationId) }
  try {
    const previous = await receipt(db, input.operationId)
    if (previous) return confirmed(previous, input, admin.id)
  } catch (error) {
    if (definiteRejection(error)) return { error: errorMessage(error), operationId: input.operationId }
    return unknown(input.operationId, "暂时无法核对原保存结果，请保留当前调整并使用原操作编号重试。")
  }
  // Receipt recovery survives a role downgrade; only a new write needs super-admin.
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以修改参与范围。", operationId: input.operationId }
  try {
    const { data, error } = await db.rpc<unknown>("admin_save_round_audience", {
      p_round_id: input.roundId, p_enabled: input.enabled, p_member_ids: input.memberIds,
      p_expected_revision: input.expectedRevision, p_operation_id: input.operationId, p_reason: input.reason,
    })
    if (error) throw error
    return confirmed(parseReceipt(data), input, admin.id)
  } catch (error) {
    try {
      const saved = await receipt(db, input.operationId)
      if (saved) return confirmed(saved, input, admin.id)
    } catch { /* The original request remains available until its outcome is known. */ }
    if (definiteRejection(error)) return { error: errorMessage(error), operationId: input.operationId }
    return unknown(input.operationId)
  }
}
