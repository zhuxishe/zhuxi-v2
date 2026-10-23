import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { buildImportPreview } from "./round-import-resolver"
import { normalizeImportName, normalizeLegacyGender } from "./round-import-utils"
import { IMPORT_FIELDS } from "./round-import-contract"
import type { ImportChoices, ImportDatabaseState, ImportDiff, ImportField, ImportMemberOption, ImportPlan, ImportPlanRow, ImportReview } from "./round-import-contract"
import type { LegacyImportMember, ParsedImportRow } from "./round-import-types"
import type { SubmissionImportMetadata } from "./import-metadata"

const labels: Record<ImportField, string> = { game_type_pref: "人数偏好", gender_pref: "搭档性别偏好", availability: "可用时段", script_activity_pref: "社团剧本或活动偏好", message: "给工作人员的话" }
const nullable = new Set<ImportField>(["script_activity_pref", "message"])

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
export function importDigest(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex") }
function same(a: unknown, b: unknown) { return canonicalJson(a) === canonicalJson(b) }
function secret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) throw new Error("导入服务暂不可用")
  return value
}
export function signImportPlan(plan: ImportPlan) {
  const payload = Buffer.from(JSON.stringify(plan)).toString("base64url")
  if (payload.length > 2 * 1024 * 1024) throw new Error("本次导入预览内容过大，请拆成较小的文件分别追加导入")
  return `${payload}.${createHmac("sha256", secret()).update(`round-import-v1:${payload}`).digest("base64url")}`
}
export function verifyImportPlan(token: string, roundId: string, actorId: string): ImportPlan {
  if (typeof token !== "string" || token.length > 2 * 1024 * 1024 + 100) throw new Error("导入预览无效，请重新预览")
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra) throw new Error("导入预览无效，请重新预览")
  const expected = createHmac("sha256", secret()).update(`round-import-v1:${payload}`).digest()
  const actual = Buffer.from(signature, "base64url")
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("导入预览已失效，请重新预览")
  let plan: ImportPlan
  try { plan = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) } catch { throw new Error("导入预览无效，请重新预览") }
  if (plan.version !== 1 || plan.roundId !== roundId || plan.actorId !== actorId || !Array.isArray(plan.rows) || !plan.rows.length) throw new Error("导入预览与本次操作不一致，请重新预览")
  return plan
}

export function parseImportChoices(raw: unknown): ImportChoices {
  if (typeof raw !== "string" || !raw.trim()) return {}
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error("导入选择无效") }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("导入选择无效")
  for (const [key, item] of Object.entries(value)) {
    if (!/^\d+$/.test(key) || !item || typeof item !== "object" || Array.isArray(item)) throw new Error("导入选择无效")
    const choice = item as Record<string, unknown>
    if (typeof choice.target !== "string" || choice.target.length > 100) throw new Error("成员选择无效")
    if (choice.gender !== undefined && !["male", "female", "other"].includes(String(choice.gender))) throw new Error("本人性别配置无效")
    if (choice.temporaryLabel !== undefined && (typeof choice.temporaryLabel !== "string" || choice.temporaryLabel.length > 100)) throw new Error("临时身份标识无效")
    if (choice.fields !== undefined) {
      if (!choice.fields || typeof choice.fields !== "object" || Array.isArray(choice.fields)) throw new Error("字段选择无效")
      for (const [field, selection] of Object.entries(choice.fields)) if (!IMPORT_FIELDS.includes(field as ImportField) || !["keep", "excel", "clear"].includes(String(selection))) throw new Error("字段选择无效")
    }
  }
  return value as ImportChoices
}

export function buildRoundImportReview(input: {
  roundId: string; actorId: string; fileHash: string; state: ImportDatabaseState
  parsedRows: ParsedImportRow[]; memberOptions: ImportMemberOption[]; legacyMembers: LegacyImportMember[]; choices: ImportChoices
  affectedBatchIds?: string[]; now?: number
}): { review: ImportReview; plan: ImportPlan | null } {
  const { parsedRows, memberOptions, legacyMembers, state, choices } = input
  const suggestions = buildImportPreview(parsedRows, memberOptions.filter(m => !m.temporary), legacyMembers)
  const plans: ImportPlanRow[] = []
  const seen = new Map<string, number>()
  const review: ImportReview = {
    rows: [], memberOptions,
    legacyOptions: legacyMembers.map(m => ({ id: m.legacy_id, name: m.full_name, gender: m.gender, school: m.school, department: m.department })).sort((a,b) => a.name.localeCompare(b.name,"zh-CN")),
    planToken: null, warnings: [], affectedBatchIds: input.affectedBatchIds ?? [],
  }
  for (const [index, row] of parsedRows.entries()) {
    const choice = choices[String(row.rowNumber)]
    const target = choice?.target ?? ""
    const errors: string[] = []
    const warnings: string[] = []
    let member = target.startsWith("member:") ? memberOptions.find(m => m.id === target.slice(7)) : undefined
    const legacy = target.startsWith("legacy:") ? legacyMembers.find(m => m.legacy_id === target.slice(7)) : undefined
    let identityKey: string | null = null
    let source: ImportPlanRow["source"] | null = member ? (member.temporary ? "temp" : "current") : legacy ? "legacy-temp" : target === "new" ? "temp" : null
    if (!source) errors.push("请明确选择对应的正式成员、临时成员或新建临时身份")
    if (legacy && !state.legacy_tokens?.[legacy.legacy_id]) errors.push("所选历史资料已变化或不可用，请重新预览并核对身份")
    if (legacy) identityKey = importDigest({ kind: "legacy", id: legacy.legacy_id })
    if (target === "new") identityKey = importDigest({ kind: "temp", name: normalizeImportName(row.name), label: normalizeImportName(choice?.temporaryLabel?.trim() || row.name) })
    const mapping = identityKey ? state.identities.find(item => item.identity_key === identityKey) : undefined
    if (mapping) {
      member = memberOptions.find(m => m.id === mapping.member_id && m.temporary)
      if (!member) errors.push("该临时身份已绑定账号、停用或匿名化，请核对身份后重新选择；不会自动新建替代身份")
    }
    const existing = member ? state.submissions.find(s => s.member_id === member.id) : undefined
    if (member?.temporary && existing?.import_metadata?.source === "legacy-temp") source = "legacy-temp"
    const existingMetadata = existing?.import_metadata && typeof existing.import_metadata === "object" ? existing.import_metadata as Record<string, unknown> : null
    const excel: Record<ImportField, unknown> = { game_type_pref: row.gameTypePref, gender_pref: row.genderPref, availability: row.availability, script_activity_pref: row.scriptActivityPref, message: row.message }
    const current: Record<ImportField, unknown> = {
      game_type_pref: existing?.game_type_pref ?? null, gender_pref: existing?.gender_pref ?? null, availability: existing?.availability ?? null,
      script_activity_pref: existingMetadata?.script_activity_pref ?? null, message: existing?.message ?? null,
    }
    const final = { ...excel }
    const diffs: ImportDiff[] = IMPORT_FIELDS.map(field => {
      const blank = row.blankFields?.includes(field) ?? (excel[field] === null || excel[field] === "" || (field === "availability" && !Object.keys(row.availability).length))
      const selection = choice?.fields?.[field] ?? (existing || blank ? "keep" : "excel")
      if (selection === "clear" && !nullable.has(field)) errors.push(`${labels[field]}不能清空`)
      if (selection === "excel" && blank) errors.push(`${labels[field]}在Excel中为空，请保留原值或明确清空可选项`)
      final[field] = selection === "keep" ? current[field] : selection === "clear" ? null : excel[field]
      if (!nullable.has(field) && (final[field] === null || (field === "availability" && !Object.keys((final[field] ?? {}) as object).length))) errors.push(`新答卷需要填写${labels[field]}`)
      const shownCurrent = field === "game_type_pref" && existingMetadata?.raw_first_choice
        ? { 人数偏好: current[field], 第一志愿: existingMetadata.raw_first_choice, 第二志愿: existingMetadata.raw_second_choice ?? null } : current[field]
      const shownExcel = field === "game_type_pref" && !blank
        ? { 人数偏好: excel[field], 第一志愿: row.rawFirstChoice, 第二志愿: row.rawSecondChoice } : blank ? null : excel[field]
      return { field, label: labels[field], current: shownCurrent, excel: shownExcel, choice: selection, nullable: nullable.has(field), blank, different: !same(shownCurrent, shownExcel) }
    })
    if (source !== "current") warnings.push("临时成员可参与试算；未绑定有效账号前，含此成员的方案不能发布站内通知")
    if (existing?.cancelled_at) warnings.push("该成员已取消报名，本次更新保留取消状态，不会自动恢复报名")
    if (!member && source === "temp" && !choice?.gender) errors.push("新建临时成员需要明确本人性别")
    if (!member && legacy?.compatibility_score === 0) errors.push("所选历史资料的兼容分为0，与现有成员主档1–5分限制不兼容。请核对历史记录或选择独立临时身份；本次不会自动改分")
    const identity = member ? `member:${member.id}` : identityKey
    if (identity) {
      const previous = seen.get(identity)
      if (previous !== undefined) errors.push(`与第 ${previous} 行指向同一成员；请合并重复行，同名不同人请填写不同的临时身份标识`)
      else seen.set(identity, row.rowNumber)
    }
    let metadata: Record<string, unknown> | SubmissionImportMetadata | null = existingMetadata
    const changed = IMPORT_FIELDS.filter(field => !same(current[field], final[field]))
    if (existing && choice?.fields?.game_type_pref === "excel" && !row.blankFields?.includes("game_type_pref")
      && (!same(existingMetadata?.raw_first_choice ?? null, row.rawFirstChoice) || !same(existingMetadata?.raw_second_choice ?? null, row.rawSecondChoice))
      && !changed.includes("game_type_pref")) changed.push("game_type_pref")
    if (existing?.cancelled_at && changed.length) errors.push("这份历史匹配答卷处于已取消状态，现有规则禁止修改。请保留所有字段；本次不会恢复报名或更改取消规则")
    if (!existing || changed.length) {
      const base: SubmissionImportMetadata = {
        ...row.importMetadata, source: source ?? "temp",
        raw_first_choice: String(final.game_type_pref ?? ""), raw_second_choice: null,
        script_activity_pref: final.script_activity_pref as string | null,
        raw_notes: final.message as string | null,
        manual_self_gender: source === "temp" ? choice?.gender ?? null : null,
        matched_member_id: source === "current" ? member?.id ?? null : null,
        matched_legacy_id: legacy?.legacy_id ?? null,
        legacy_profile: legacy ?? null,
      }
      metadata = { ...base, ...existingMetadata }
      if (!existing || changed.includes("game_type_pref")) { metadata.raw_first_choice = row.rawFirstChoice; metadata.raw_second_choice = row.rawSecondChoice }
      if (!existing || changed.includes("script_activity_pref")) metadata.script_activity_pref = final.script_activity_pref
      if (!existing || changed.includes("message")) metadata.raw_notes = final.message
    }
    const tempProfile: ImportPlanRow["temp_profile"] = !member && source !== "current" && source ? {
      full_name: row.name, gender: legacy ? normalizeLegacyGender(legacy.gender) : choice?.gender ?? "other",
      school: legacy?.school ?? null, department: legacy?.department ?? null, interest_tags: legacy?.interest_tags ?? [], social_tags: legacy?.social_tags ?? [],
      game_mode: legacy?.game_mode ?? null, compatibility_score: legacy?.compatibility_score ?? null, session_count: legacy?.session_count ?? null,
    } : null
    review.rows.push({ rowNumber: row.rowNumber, name: row.name, suggestedMemberId: suggestions[index]?.currentMatch?.id ?? null, suggestedLegacyIds: suggestions[index]?.exactLegacyMatches.map(m => m.id) ?? [], target, memberId: member?.id ?? null, source, reusedTemporary: !!mapping && !!member, cancelled: !!existing?.cancelled_at, diffs, errors, warnings })
    if (!errors.length && source) plans.push({
      row_number: row.rowNumber, source, identity_key: identityKey,
      existing_member_id: member?.id ?? null, expected_member_token: member ? state.member_tokens[member.id] : null,
      expected_submission: existing ? { id: existing.id as string, updated_at: existing.updated_at as string } : null,
      expected_legacy: legacy ? { id: legacy.legacy_id, token: state.legacy_tokens![legacy.legacy_id] } : null,
      answers: { game_type_pref: final.game_type_pref as string, gender_pref: final.gender_pref as string, availability: final.availability as ParsedImportRow["availability"], message: final.message as string | null, import_metadata: metadata }, temp_profile: tempProfile,
    })
  }
  // Historical imported identities are intentionally not inferred, merged or deleted.
  if (state.submissions.some(s => String(s.import_metadata?.source ?? "").includes("temp") && !state.identities.some(i => i.member_id === s.member_id))) review.warnings.push("存在早期导入的临时身份：本次不会自动合并或修复，请在成员选择中明确选择对应临时成员，避免重复建人。")
  const historical = memberOptions.filter(member => member.temporary && !state.identities.some(identity => identity.member_id === member.id))
  for (const member of historical) review.warnings.push(`早期临时身份待人工核对：${member.full_name ?? member.nickname ?? "未填写姓名"} · ${member.member_number ?? member.id}。如为同一人，请明确选择此身份；不会自动合并。`)
  if (review.affectedBatchIds.length) review.warnings.push("已有匹配方案使用旧输入。导入后保留原方案和快照；需要包含新答案时，请新建运行。发布保护保持现状。")
  const plan: ImportPlan | null = plans.length === parsedRows.length && parsedRows.length > 0 ? { version: 1, roundId: input.roundId, actorId: input.actorId, fileHash: input.fileHash, expiresAt: (input.now ?? Date.now()) + 30 * 60_000, roundToken: state.round_token, rows: plans } : null
  return { review, plan }
}
