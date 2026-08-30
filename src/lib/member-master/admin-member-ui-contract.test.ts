import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("admin member center UI contracts", () => {
  it("removes obsolete English display phrases while retaining necessary technical terms", () => {
    const hub = source("src/components/admin/Member360Hub.tsx")
    const table = source("src/components/admin/MemberTable.tsx")
    const advanced = source("src/components/admin/MemberAdvancedSectionEditors.tsx")

    for (const phrase of [
      "变更前 / Before",
      "变更后 / After",
      "成员主记录 / Canonical member",
      "登录账号 / Auth account",
      "基本与学业 / Identity",
      "语言 / Language",
      "兴趣与活动偏好 / Interests",
      "性格自评 / Personality",
      "个人边界 / Boundaries",
      "人格测试 / Quiz",
      "申请流程 / Application",
      "身份核验 / Verification",
      "面试评估 / Interview evaluations",
      "Staff 公开档案 / Staff profiles",
      "成员角色 / Roles",
      "历史来源记录 / Legacy records",
      "活动统计 / Dynamic stats",
      "个人主页运营指标 / Profile metrics",
      "匹配与互评 / Matching",
      "匹配问卷 / Round submissions",
      "未匹配诊断 / Unmatched diagnostics",
      "剧本授权与游玩记录 / Script play records",
      "社区公开资料 / Community",
      "玩家反馈 / Feedback",
      "变更审计 / Audit trail",
      "潜在重复记录 / Duplicate candidates",
    ]) {
      expect(hub).not.toContain(phrase)
    }
    expect(hub).toContain("memberAuditActionLabel")
    expect(hub).toContain("memberAuditSectionLabel")
    expect(hub).toContain("formatMemberValue(value, key)")
    expect(hub).toContain("member_status: data.member.status")

    expect(table).not.toContain("Canonical member ID")
    expect(table).not.toContain("provider 因权限隐藏")

    for (const phrase of [
      "志愿者 / Volunteer",
      "社区管理员 / Community moderator",
      "运营 / Operations",
      "（super_admin）",
      '<option value="not_started">not_started</option>',
      '<option value="in_progress">in_progress</option>',
      '<option value="submitted">submitted</option>',
      '<option value="complete">complete</option>',
      '<option value="unclaimed">unclaimed</option>',
    ]) {
      expect(advanced).not.toContain(phrase)
    }
  })

  it("uses only schema-supported directory filter values", () => {
    const filters = source("src/components/admin/MemberListFilter.tsx")
    expect(filters).toContain('["in_progress", "填写中"]')
    expect(filters).not.toContain('["draft"')
    for (const value of ["unbound", "active", "suspended", "closed"]) {
      expect(filters).toContain(`["${value}"`)
    }
    for (const value of ["app", "line", "legacy", "import", "admin"]) {
      expect(filters).toContain(`["${value}"`)
    }
    expect(filters).not.toContain("public_form")
  })

  it("gates blank-shell hard delete on preflight and canonical confirmation", () => {
    const lifecycle = source("src/components/admin/MemberDeleteButton.tsx")
    expect(lifecycle).toContain("impact?.can_hard_delete === true")
    expect(lifecycle).toContain("confirmation.trim() !== memberId")
    expect(lifecycle).toContain("hardDeleteBlankMemberAction")
  })

  it("marks duplicate candidates without claiming an automatic merge", () => {
    const duplicate = source("src/components/admin/MemberDuplicateCandidateActions.tsx")
    expect(duplicate).toContain('resolve("confirmed_duplicate")')
    expect(duplicate).toContain('resolve("not_duplicate")')
    expect(duplicate).toContain("不会自动合并")
  })

  it("calls the official Auth Admin operations and finalizes the tombstone", () => {
    const actions = source("src/app/admin/members/[id]/actions.ts")
    expect(actions).toContain("authAdmin.updateUserById")
    expect(actions).toContain("authAdmin.getUserById")
    expect(actions).toContain("authAdmin.deleteUser(userId, shouldSoftDelete)")
    expect(actions).toContain("completeMemberAuthDelete")
  })

  it("keeps administrator management super-admin only at navigation, page and action boundaries", () => {
    const sidebar = source("src/components/admin/AdminSidebar.tsx")
    const page = source("src/app/admin/users/page.tsx")
    const actions = source("src/app/admin/users/actions.ts")
    expect(sidebar).toContain('{ href: "/admin/users", label: "管理员", icon: ShieldCheck, superAdminOnly: true }')
    expect(page).toContain('admin.role !== "super_admin"')
    expect(actions).toMatch(/fetchAdminList[\s\S]*admin\.role !== "super_admin"/)
    expect(actions).toContain('"admin_create_admin_whitelist"')
    expect(actions).toContain('"admin_update_admin_user_role"')
    expect(actions).toContain('"admin_delete_admin_user"')
    expect(actions).toContain("p_reason: reasonResult.reason")
    expect(actions).not.toContain("count: \"exact\"")
  })

  it("exposes every mutable identity field plus quiz completion time", () => {
    const editForm = source("src/components/admin/MemberEditForm.tsx")
    const identity = source("src/components/admin/MemberEditIdentity.tsx")
    const editActions = source("src/app/admin/members/[id]/edit/actions.ts")
    const advanced = source("src/components/admin/MemberAdvancedSectionEditors.tsx")
    for (const field of ["height_weight", "phone", "sns_accounts", "personal_avatar_path"]) {
      expect(identity).toContain(`name="${field}"`)
      expect(editActions).toContain(`"${field}"`)
    }
    expect(advanced).toContain("completed_at: parsedCompletedAt.toISOString()")
    expect(advanced).toContain('section: "workflow"')
    expect(editForm).toContain("missingInitialIdentityFields")
    expect(editForm).toContain("首次建立基本信息时，请同时填写")
    expect(editForm).toContain("本次尚未保存任何分区")
    expect(advanced).toContain("normalizeStoredQuizAnswers")
    expect(advanced).toContain("Array.isArray(parsed) ? parsed : value")
  })

  it("keeps player quiz answers as a JSON array and hides empty-snapshot restore", () => {
    const playerQuiz = source("src/app/app/profile/quiz/actions.ts")
    const hub = source("src/components/admin/Member360Hub.tsx")
    expect(playerQuiz).toMatch(/member_id: player\.memberId,\s*answers,\s*score_e:/)
    expect(playerQuiz).not.toContain("answers: JSON.stringify")
    expect(hub).toContain("hasRestorableMemberAuditSnapshot(before)")
  })

  it("edits legacy business fields through the audited super-admin RPC without exposing immutable links", () => {
    const hub = source("src/components/admin/Member360Hub.tsx")
    const editor = source("src/components/admin/MemberAdvancedSectionEditors.tsx")
    const actions = source("src/app/admin/members/[id]/advanced/actions.ts")
    const queries = source("src/lib/queries/member-center.ts")
    const allowedKeys = actions.match(
      /const LEGACY_EDITABLE_KEYS = new Set\(\[[\s\S]*?\]\)/,
    )?.[0] ?? ""

    expect(hub).toContain("canModifyHighRisk && data.legacyRecords.length > 0")
    expect(hub).toContain("<MemberLegacyAdvancedEditor")
    expect(editor).toContain("updateLegacyMemberAction")
    for (const field of [
      "member_no", "full_name", "gender", "school", "department",
      "interest_tags", "social_tags", "game_mode", "compatibility_score",
      "session_count", "match_history", "claim_status",
    ]) {
      expect(allowedKeys).toContain(`"${field}"`)
    }
    for (const immutable of [
      "id", "canonical_member_id", "claimed_by", "reviewed_by",
      "claimed_at", "reviewed_at", "created_at", "audit_reason",
    ]) {
      expect(allowedKeys).not.toContain(`"${immutable}"`)
    }
    expect(actions).toContain('admin.role !== "super_admin"')
    expect(queries).toContain('"admin_upsert_legacy_member"')
    expect(queries).toContain("p_reason: input.reason")
  })

  it("keeps raw member workbook preview and import super-admin only", () => {
    const actions = source("src/app/admin/matching/rounds/[id]/import-actions.ts")
    const page = source("src/app/admin/matching/rounds/[id]/page.tsx")
    expect(actions.match(/admin\.role !== "super_admin"/g)).toHaveLength(2)
    expect(page).toContain('canImportMembers={admin.role === "super_admin"}')
  })

  it("writes activity records through reason-carrying audited RPCs", () => {
    const actions = source("src/app/admin/activity-records/actions.ts")
    expect(actions).toContain('"admin_upsert_activity_record"')
    expect(actions).toContain('"admin_delete_activity_record"')
    expect(actions).toContain("p_reason: reasonResult.reason")
    expect(actions).not.toContain('.from("activity_records")')
  })

  it("requires and forwards an audit reason for every administrator matching mutation", () => {
    const sessionActions = source("src/app/admin/matching/[id]/actions.ts")
    const manualActions = source("src/app/admin/matching/[id]/manual-actions.ts")
    const poolActions = source("src/app/admin/matching/[id]/pool-actions.ts")
    const cancellationActions = source("src/app/admin/matching/cancellations/actions.ts")
    const blacklistActions = source("src/app/admin/matching/blacklist/actions.ts")
    const roundActions = source("src/app/admin/matching/rounds/[id]/actions.ts")
    const sessionUi = source("src/components/admin/MatchSessionView.tsx")

    for (const actions of [sessionActions, manualActions, poolActions, cancellationActions, blacklistActions, roundActions]) {
      expect(actions).toContain("normalizeAdminAuditReason")
    }
    for (const actions of [sessionActions, manualActions, poolActions, cancellationActions, blacklistActions, roundActions]) {
      expect(actions).toContain("audit_reason")
    }
    expect(sessionActions).toContain('"admin_delete_operational_record"')
    expect(blacklistActions).toContain('"admin_delete_operational_record"')
    expect(sessionUi).toContain("auditReason={auditReason}")
    expect(sessionUi).toContain("deleteSession(session.id, auditReason)")
    expect(sessionUi).toContain("confirmSession(session.id, auditReason)")
    expect(sessionUi).toContain('r.status === "locked" ? unlockPair : lockPair')
    expect(sessionActions).toMatch(/unlockPair[\s\S]*status !== "locked"[\s\S]*audit_reason/)
  })

  it("wires audited note editing and super-only raw statistics into the statistics page", () => {
    const page = source("src/app/admin/members/[id]/stats/page.tsx")
    const editor = source("src/components/admin/MemberStatsAdminEditor.tsx")
    const actions = source("src/app/admin/members/[id]/stats/actions.ts")
    expect(page).toContain("<MemberStatsAdminEditor")
    expect(page).toContain('canOverrideRaw={admin.role === "super_admin"}')
    expect(editor).toContain("adminAuditReasonIsValid")
    expect(editor).toContain("overrideMemberDynamicStats")
    expect(editor).toContain("upsertMemberNote")
    expect(editor).toContain("deleteMemberNote")
    expect(actions).toContain('admin.role !== "super_admin"')
    expect(actions).toContain('"admin_override_member_dynamic_stats"')
    expect(actions).toContain('"admin_upsert_member_note"')
    expect(actions).toContain('p_entity: "member_notes"')
  })

  it("requires audit reasons for related feedback, submission, and script-access mutations", () => {
    const feedback = source("src/app/admin/feedback/actions.ts")
    const feedbackUi = source("src/components/admin/PlayerFeedbackStatusForm.tsx")
    const submissions = source("src/app/admin/matching/rounds/[id]/actions.ts")
    const submissionUi = source("src/components/admin/SubmissionEditDialog.tsx")
    const scripts = source("src/app/admin/scripts/[id]/actions.ts")
    const scriptUi = source("src/components/admin/ScriptAccessPanel.tsx")
    for (const action of [feedback, submissions, scripts]) {
      expect(action).toContain("normalizeAdminAuditReason")
    }
    expect(feedback).toContain('"admin_update_player_feedback"')
    expect(feedback).toContain("p_reason: reasonResult.reason")
    expect(submissions).toContain("audit_reason")
    expect(scripts).toContain("audit_reason")
    for (const ui of [feedbackUi, submissionUi, scriptUi]) {
      expect(ui).toContain("adminAuditReasonIsValid")
    }
    expect(submissions).toContain('p_entity: "match_round_submissions"')
  })

  it("keeps raw round submissions and their mutations super-admin only", () => {
    const page = source("src/app/admin/matching/rounds/[id]/page.tsx")
    const actions = source("src/app/admin/matching/rounds/[id]/actions.ts")
    const rounds = source("src/lib/queries/rounds.ts")
    const client = source("src/components/admin/RoundDetailClient.tsx")
    expect(page).toContain('canManageSubmissions={admin.role === "super_admin"}')
    expect(actions.match(/admin\.role !== "super_admin"/g)).toHaveLength(3)
    expect(rounds).toContain('admin.role === "super_admin"')
    expect(client).toContain("showRaw={canManageSubmissions}")
  })

  it("uses the safe Staff projection publicly and audits every administrator mutation", () => {
    const query = source("src/lib/queries/staff.ts")
    const actions = source("src/app/admin/staff/actions.ts")
    const createUi = source("src/app/admin/staff/StaffProfileForm.tsx")
    const listUi = source("src/app/admin/staff/StaffProfileList.tsx")
    expect(query).toContain('.from("published_staff_profiles")')
    expect(actions).toContain("normalizeAdminAuditReason")
    expect(actions).toContain("audit_reason: reasonResult.reason")
    expect(actions).toContain('p_entity: "staff_profiles"')
    expect(actions).toContain("p_reason: reasonResult.reason")
    expect(createUi).toContain("adminAuditReasonIsValid")
    expect(listUi).toContain("adminAuditReasonIsValid")
  })

  it("redacts raw round inputs across session detail, compatibility checks, and export", () => {
    const page = source("src/app/admin/matching/[id]/page.tsx")
    const view = source("src/components/admin/MatchSessionView.tsx")
    const checks = source("src/app/admin/matching/[id]/manual-actions.ts")
    const exportRoute = source("src/app/admin/matching/[id]/export/route.ts")
    const exporter = source("src/lib/matching/session-export.ts")
    expect(page).toContain('const canViewRawSubmissions = admin.role === "super_admin"')
    expect(page).toMatch(
      /clientResults\s*=\s*canViewRawSubmissions\s*\?\s*enrichedResults/
    )
    expect(page).toContain("score_breakdown: null")
    expect(view).toContain("canViewRawSubmissions &&")
    expect(checks).toContain("redactRawConstraintDetails")
    expect(checks).toContain('admin.role === "super_admin"')
    expect(exportRoute).toContain('admin.role !== "super_admin"')
    expect(exporter).toContain('admin.role !== "super_admin"')
  })
})
