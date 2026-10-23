import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildRoundImportReview, importDigest, parseImportChoices, signImportPlan, verifyImportPlan } from "./round-import-plan"
import type { ImportChoices, ImportDatabaseState, ImportMemberOption } from "./round-import-contract"
import type { LegacyImportMember, ParsedImportRow } from "./round-import-types"

const roundId = "10000000-0000-4000-8000-000000000001"
const actorId = "10000000-0000-4000-8000-000000000002"
const memberId = "20000000-0000-4000-8000-000000000001"
const tempId = "20000000-0000-4000-8000-000000000002"
const legacyId = "30000000-0000-4000-8000-000000000001"
const row: ParsedImportRow = {
  rowNumber: 4, name: "张三", normalizedName: "张三", gameTypePref: "都可以", rawFirstChoice: "双人本", rawSecondChoice: "多人本",
  genderPref: "女", availability: { "2026-10-27": ["下午"] }, scriptActivityPref: "都可以", message: "Excel留言",
  importMetadata: { source: "temp", normalized_name: "张三", raw_first_choice: "双人本", raw_second_choice: "多人本", script_activity_pref: "都可以", raw_notes: "Excel留言", warnings: [] },
}
const formal: ImportMemberOption = { id: memberId, member_number: "ZXS_1", full_name: "张三", nickname: null, temporary: false }
const temp: ImportMemberOption = { id: tempId, member_number: "IMP-10000000-001", full_name: "张三", nickname: null, temporary: true }
const legacy: LegacyImportMember = { legacy_id: legacyId, full_name: "张三", gender: "女", school: "原学校", department: "原专业", interest_tags: ["桌游"], social_tags: ["安静"], game_mode: "多人", compatibility_score: 4, session_count: 3, match_history: [] }
const original = {
  id: "40000000-0000-4000-8000-000000000001", member_id: memberId, updated_at: "2026-10-23T00:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z",
  game_type_pref: "双人", gender_pref: "都可以", availability: { "2026-10-28": ["晚上"] }, message: "线上原留言",
  interest_tags: ["线上兴趣"], social_style: "线上社交方式", custom_answers: { required_question: "线上补充答案" }, cancelled_at: null,
  import_metadata: null,
}
const state = (): ImportDatabaseState => ({ round: { id: roundId, purpose: "matching", status: "open" }, temporary_members: [], round_token: "round-token", legacy_tokens: { [legacyId]: "legacy-token" }, member_tokens: { [memberId]: "formal-token", [tempId]: "temp-token" }, identities: [], submissions: [{ ...original }] })
function review(choices: ImportChoices = {}, patch: Partial<Parameters<typeof buildRoundImportReview>[0]> = {}) {
  return buildRoundImportReview({ roundId, actorId, fileHash: "a".repeat(64), state: state(), parsedRows: [row], memberOptions: [formal], legacyMembers: [legacy], choices, now: 1_000, ...patch })
}

describe("round import confirmed append/update plans", () => {
  beforeEach(() => { vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated-unit-test-signing-key") })
  afterEach(() => { vi.unstubAllEnvs() })

  it("offers a unique name match without automatically confirming the member", () => {
    const result = review()
    expect(result.review.rows[0].suggestedMemberId).toBe(memberId)
    expect(result.review.rows[0].target).toBe("")
    expect(result.review.rows[0].errors.join(" ")).toContain("明确选择")
    expect(result.plan).toBeNull()
  })

  it("keeps every existing answer by default after the administrator confirms identity", () => {
    const result = review({ 4: { target: `member:${memberId}` } })
    expect(result.plan?.rows[0].answers).toEqual({ game_type_pref: original.game_type_pref, gender_pref: original.gender_pref, availability: original.availability, message: original.message, import_metadata: null })
    expect(result.plan?.rows[0].expected_submission).toEqual({ id: original.id, updated_at: original.updated_at })
    expect(result.plan?.rows[0].expected_member_token).toBe("formal-token")
    expect(result.review.rows[0].diffs.every(diff => diff.choice === "keep")).toBe(true)
    expect(result.plan?.rows[0]).not.toHaveProperty("custom_answers")
    expect(result.plan?.rows[0].temp_profile).toBeNull()
  })

  it("uses Excel only for specifically selected conflicting fields", () => {
    const result = review({ 4: { target: `member:${memberId}`, fields: { message: "excel", gender_pref: "excel" } } })
    expect(result.plan?.rows[0].answers).toMatchObject({ game_type_pref: "双人", gender_pref: "女", availability: original.availability, message: "Excel留言" })
    expect(result.plan?.rows[0].answers.import_metadata).toMatchObject({ raw_notes: "Excel留言", matched_member_id: memberId })
  })

  it("treats blank Excel fields as keep and permits explicit clear only for optional fields", () => {
    const blankRow: ParsedImportRow = { ...row, message: null, scriptActivityPref: null, availability: {}, blankFields: ["message", "script_activity_pref", "availability"] }
    const kept = review({ 4: { target: `member:${memberId}` } }, { parsedRows: [blankRow] })
    expect(kept.plan?.rows[0].answers.message).toBe(original.message)
    expect(kept.plan?.rows[0].answers.availability).toEqual(original.availability)
    const cleared = review({ 4: { target: `member:${memberId}`, fields: { message: "clear" } } }, { parsedRows: [blankRow] })
    expect(cleared.plan?.rows[0].answers.message).toBeNull()
    const forbidden = review({ 4: { target: `member:${memberId}`, fields: { availability: "clear" } } }, { parsedRows: [blankRow] })
    expect(forbidden.plan).toBeNull()
    expect(forbidden.review.rows[0].errors.join(" ")).toContain("不能清空")
  })

  it("refuses a blank Excel override instead of silently clearing an online answer", () => {
    const result = review({ 4: { target: `member:${memberId}`, fields: { message: "excel" } } }, { parsedRows: [{ ...row, message: null, blankFields: ["message"] }] })
    expect(result.plan).toBeNull()
    expect(result.review.rows[0].errors.join(" ")).toContain("明确清空")
  })

  it("rejects a new participant lacking required answers after resolving identity", () => {
    const result = review({ 4: { target: "new", gender: "other" } }, { state: { ...state(), submissions: [] }, parsedRows: [{ ...row, availability: {}, blankFields: ["availability"] }] })
    expect(result.plan).toBeNull()
    expect(result.review.rows[0].errors.join(" ")).toContain("新答卷需要填写可用时段")
  })

  it("retains the first/second preference metadata without changing scoring inputs", () => {
    const result = review({ 4: { target: `legacy:${legacyId}` } }, { state: { ...state(), submissions: [] } })
    expect(result.plan?.rows[0].answers.game_type_pref).toBe("都可以")
    expect(result.plan?.rows[0].answers.import_metadata).toMatchObject({ raw_first_choice: "双人本", raw_second_choice: "多人本", matched_legacy_id: legacyId, legacy_profile: legacy })
    expect(result.plan?.rows[0].expected_legacy).toEqual({ id: legacyId, token: "legacy-token" })
    expect(result.plan?.rows[0].temp_profile).toMatchObject({ gender: "female", school: "原学校", compatibility_score: 4, session_count: 3 })
    expect(result.review.rows[0].warnings.join(" ")).toContain("不能发布站内通知")
  })

  it("does not overwrite earlier imported preference metadata when only the message changes", () => {
    const saved = { ...original, import_metadata: { ...row.importMetadata, source: "current", matched_member_id: memberId, script_activity_pref: "原社团偏好", legacy_profile: { private_original: true } } }
    const result = review({ 4: { target: `member:${memberId}`, fields: { message: "excel" } } }, { state: { ...state(), submissions: [saved] } })
    expect(result.plan?.rows[0].answers.import_metadata).toMatchObject({ raw_first_choice: "双人本", raw_second_choice: "多人本", script_activity_pref: "原社团偏好", legacy_profile: { private_original: true }, raw_notes: "Excel留言" })
  })

  it("honors an explicit Excel first/second preference swap even when both normalize to 都可以", () => {
    const savedMetadata = { ...row.importMetadata, source: "current", matched_member_id: memberId }
    const saved = { ...original, game_type_pref: "都可以", import_metadata: savedMetadata }
    const swapped = { ...row, rawFirstChoice: "多人本", rawSecondChoice: "双人本" }
    const patch = { state: { ...state(), submissions: [saved] }, parsedRows: [swapped] }
    const kept = review({ 4: { target: `member:${memberId}` } }, patch)
    expect(kept.plan?.rows[0].answers.import_metadata).toEqual(savedMetadata)
    const selected = review({ 4: { target: `member:${memberId}`, fields: { game_type_pref: "excel" } } }, patch)
    expect(selected.plan?.rows[0].answers.game_type_pref).toBe("都可以")
    expect(selected.plan?.rows[0].answers.import_metadata).toMatchObject({ raw_first_choice: "多人本", raw_second_choice: "双人本" })
    expect(selected.review.rows[0].diffs.find(diff => diff.field === "game_type_pref")).toMatchObject({
      current: { 人数偏好: "都可以", 第一志愿: "双人本", 第二志愿: "多人本" },
      excel: { 人数偏好: "都可以", 第一志愿: "多人本", 第二志愿: "双人本" }, different: true,
    })
  })

  it("reports an invalid legacy score without silently changing the original score or scale", () => {
    const invalidLegacy = { ...legacy, compatibility_score: 0 }
    const result = review({ 4: { target: `legacy:${legacyId}` } }, { state: { ...state(), submissions: [] }, legacyMembers: [invalidLegacy] })
    expect(result.plan).toBeNull()
    expect(result.review.rows[0].errors.join(" ")).toContain("兼容分为0")
    expect(invalidLegacy.compatibility_score).toBe(0)
  })

  it("requires a server snapshot token before copying legacy identity information", () => {
    const result = review({ 4: { target: `legacy:${legacyId}` } }, { state: { ...state(), legacy_tokens: {}, submissions: [] } })
    expect(result.plan).toBeNull()
    expect(result.review.rows[0].errors.join(" ")).toContain("历史资料已变化或不可用")
  })

  it("reuses the same round-local temporary UUID and preserves cancellation", () => {
    const key = importDigest({ kind: "temp", name: "张三", label: "张三" })
    const saved = { ...original, member_id: tempId, cancelled_at: "2026-10-22T00:00:00Z", import_metadata: row.importMetadata }
    const result = review({ 4: { target: "new", gender: "other" } }, { memberOptions: [formal, temp], state: { ...state(), identities: [{ identity_key: key, member_id: tempId }], submissions: [saved] } })
    expect(result.plan?.rows[0].existing_member_id).toBe(tempId)
    expect(result.plan?.rows[0].temp_profile).toBeNull()
    expect(result.review.rows[0].reusedTemporary).toBe(true)
    expect(result.review.rows[0].cancelled).toBe(true)
    expect(result.review.rows[0].warnings.join(" ")).toContain("不会自动恢复报名")
  })

  it("does not offer to modify an abnormal cancelled matching answer against the existing cancellation guard", () => {
    const saved = { ...original, cancelled_at: "2026-10-22T00:00:00Z" }
    const result = review({ 4: { target: `member:${memberId}`, fields: { message: "excel" } } }, { state: { ...state(), submissions: [saved] } })
    expect(result.plan).toBeNull()
    expect(result.review.rows[0].errors.join(" ")).toContain("现有规则禁止修改")
    expect(saved.cancelled_at).toBe("2026-10-22T00:00:00Z")
  })

  it("does not create a replacement when a stable temporary mapping became unavailable", () => {
    const result = review({ 4: { target: "new", gender: "other" } }, { state: { ...state(), identities: [{ identity_key: importDigest({ kind: "temp", name: "张三", label: "张三" }), member_id: tempId }], submissions: [] } })
    expect(result.plan).toBeNull()
    expect(result.review.rows[0].errors.join(" ")).toContain("不会自动新建替代身份")
  })

  it("rejects duplicate legacy identities even when the file uses different names", () => {
    const second = { ...row, rowNumber: 9, name: "另一写法", normalizedName: "另一写法" }
    const result = review({ 4: { target: `legacy:${legacyId}` }, 9: { target: `legacy:${legacyId}` } }, { state: { ...state(), submissions: [] }, parsedRows: [row, second] })
    expect(result.plan).toBeNull()
    expect(result.review.rows[1].errors.join(" ")).toContain("第 4 行")
  })

  it("supports genuine same-name people through explicitly different temporary labels", () => {
    const result = review({ 4: { target: "new", gender: "other", temporaryLabel: "甲" }, 9: { target: "new", gender: "other", temporaryLabel: "乙" } }, { state: { ...state(), submissions: [] }, parsedRows: [row, { ...row, rowNumber: 9 }] })
    expect(result.plan?.rows).toHaveLength(2)
    expect(result.plan?.rows[0].identity_key).not.toBe(result.plan?.rows[1].identity_key)
  })

  it("keeps colon-containing names and labels as separate identities", () => {
    const result = review({ 4: { target: "new", gender: "other", temporaryLabel: "c" }, 9: { target: "new", gender: "other", temporaryLabel: "b:c" } }, { state: { ...state(), submissions: [] }, parsedRows: [{ ...row, name: "a:b", normalizedName: "a:b" }, { ...row, rowNumber: 9, name: "a", normalizedName: "a" }] })
    expect(result.plan?.rows).toHaveLength(2)
    expect(result.plan?.rows[0].identity_key).not.toBe(result.plan?.rows[1].identity_key)
  })

  it("bounds the signed request before it can exceed the production request body", () => {
    const plan = review({ 4: { target: `member:${memberId}` } }).plan!
    const oversized = { ...plan, rows: [{ ...plan.rows[0], answers: { ...plan.rows[0].answers, message: "a".repeat(2 * 1024 * 1024) } }] }
    expect(() => signImportPlan(oversized)).toThrow("预览内容过大")
    expect(() => verifyImportPlan("a".repeat(2 * 1024 * 1024 + 101), roundId, actorId)).toThrow("预览无效")
  })

  it("remounts import state when changing rounds and configures enough transport room for bounded requests", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/components/admin/RoundDetailClient.tsx"), "utf8")
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8")
    expect(detail).toContain("<RoundImportPanel key={round.id}")
    expect(config).toContain('serverActions: { bodySizeLimit: "4mb" }')
  })

  it("warns about historic imports and old plans without repairing, deleting or forbidding publication", () => {
    const result = review({ 4: { target: `member:${memberId}` } }, { state: { ...state(), submissions: [original, { ...original, id: "old-temp-sub", member_id: tempId, import_metadata: row.importMetadata }] }, affectedBatchIds: ["old-frozen-batch"] })
    expect(result.plan).not.toBeNull()
    expect(result.review.warnings.join(" ")).toContain("不会自动合并或修复")
    expect(result.review.warnings.join(" ")).toContain("发布保护保持现状")
    expect(result.review.affectedBatchIds).toEqual(["old-frozen-batch"])
    expect(result.plan?.rows).toHaveLength(1)
  })

  it("binds signed review plans to their actor and round and rejects payload tampering", () => {
    const plan = review({ 4: { target: `member:${memberId}` } }).plan!
    const token = signImportPlan(plan)
    expect(verifyImportPlan(token, roundId, actorId)).toEqual(plan)
    expect(() => verifyImportPlan(token, "another-round", actorId)).toThrow("不一致")
    expect(() => verifyImportPlan(token, roundId, "another-actor")).toThrow("不一致")
    const [payload, signature] = token.split(".")
    const changed = Buffer.from(JSON.stringify({ ...plan, rows: [{ ...plan.rows[0], existing_member_id: tempId }] })).toString("base64url")
    expect(() => verifyImportPlan(`${changed}.${signature}`, roundId, actorId)).toThrow("失效")
    expect(() => verifyImportPlan(`${payload}.bad-signature`, roundId, actorId)).toThrow("失效")
    expect(() => verifyImportPlan(`${token}.extra`, roundId, actorId)).toThrow("无效")
  })

  it("parses only supported row and field choices", () => {
    expect(parseImportChoices('{"4":{"target":"new","gender":"other","fields":{"message":"clear"}}}')).toMatchObject({ 4: { target: "new", fields: { message: "clear" } } })
    for (const invalid of ["[]", "null", '{"4":{"target":"new","fields":{"custom_answers":"excel"}}}', '{"4":{"target":"new","gender":"invalid"}}', '{"bad-row":{"target":"new"}}']) expect(() => parseImportChoices(invalid)).toThrow()
  })
})
