"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import {
  contentMediaCleanupOutboxIsReady,
  runContentMediaCleanupJobsForContent,
} from "@/lib/content-media-cleanup"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createClient } from "@/lib/supabase/server"
import type { Json, TablesUpdate } from "@/types/database.types"

const ALLOWED_METADATA_FIELDS = [
  "title",
  "title_ja",
  "author",
  "description",
  "player_count_min",
  "player_count_max",
  "duration_minutes",
  "difficulty",
  "genre_tags",
  "theme_tags",
  "is_published",
  "is_featured",
  "budget",
  "location",
  "warnings",
  "is_player_visible",
  "is_social_script",
  "show_on_player_activity",
  "player_activity_order",
  "pin_in_social_library",
  "social_library_order",
] as const

type UpdateData = Record<string, string | number | boolean | string[] | Json | null>
interface ExpectedScriptVersions {
  scriptUpdatedAt: string
  protectedUpdatedAt: string | null
}

export async function updateScript(
  scriptId: string,
  data: UpdateData,
  rawReason: string,
  expectedVersions: ExpectedScriptVersions,
) {
  await requireAdmin()
  if (!validExpectedVersions(expectedVersions)) return { error: "页面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const validationError = validateScriptNumbers(data)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const [scriptLookup, protectedLookup] = await Promise.all([
    supabase
      .from("scripts")
      .select("id, updated_at")
      .eq("id", scriptId)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("script_protected_content")
      .select("updated_at")
      .eq("script_id", scriptId)
      .maybeSingle(),
  ])
  const { data: current, error: lookupError } = scriptLookup
  const { data: currentProtected, error: protectedLookupError } = protectedLookup
  if (lookupError || protectedLookupError) return { error: "读取剧本状态失败" }
  if (!current) return { error: "剧本不存在或已进入回收站" }
  if (current.updated_at !== expectedVersions.scriptUpdatedAt) {
    return { error: "基本信息已被其他管理员修改，请刷新后重试" }
  }
  if ((currentProtected?.updated_at ?? null) !== expectedVersions.protectedUpdatedAt) {
    return { error: "完整剧本内容已被其他管理员修改，请刷新后重试" }
  }
  const protectedPayload = {
    script_id: scriptId,
    core_content_html: typeof data.content_html === "string" ? data.content_html : null,
    roles: (data.roles ?? []) as Json,
    audit_reason: reasonResult.reason,
  }

  // Protected content is stored separately from public/player metadata.
  const protectedResult = currentProtected
    ? await supabase
        .from("script_protected_content")
        .update(protectedPayload)
        .eq("script_id", scriptId)
        .eq("updated_at", expectedVersions.protectedUpdatedAt!)
        .select("updated_at")
        .maybeSingle()
    : await supabase
        .from("script_protected_content")
        .insert(protectedPayload)
        .select("updated_at")
        .maybeSingle()
  if (protectedResult.error || !protectedResult.data) {
    console.error("[updateScript:protected]", protectedResult.error)
    if (!protectedResult.data && !protectedResult.error) {
      return { error: "完整剧本内容已被其他管理员修改，请刷新后重试" }
    }
    return { error: "完整剧本内容保存失败，其他修改未提交" }
  }

  const filtered: UpdateData = {}
  for (const key of Object.keys(data)) {
    if ((ALLOWED_METADATA_FIELDS as readonly string[]).includes(key)) filtered[key] = data[key]
  }
  if (filtered.is_player_visible === false || filtered.is_social_script === false) {
    filtered.show_on_player_activity = false
    filtered.pin_in_social_library = false
  }
  filtered.audit_reason = reasonResult.reason

  const { data: updated, error } = await supabase
    .from("scripts")
    .update(filtered as TablesUpdate<"scripts">)
    .eq("id", scriptId)
    .eq("updated_at", expectedVersions.scriptUpdatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()

  if (error) {
    console.error("[updateScript]", error)
    return { error: "基本信息保存失败；完整内容已安全保存，请重试本页" }
  }
  if (!updated) return { error: "基本信息已被其他管理员修改；完整内容已安全保存，请刷新后确认" }
  revalidateScriptPaths(scriptId)
  return {
    success: true,
    updatedAt: updated.updated_at,
    protectedUpdatedAt: protectedResult.data.updated_at,
  }
}

export async function toggleScriptPublish(
  scriptId: string,
  isPublished: boolean,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  return updateScriptFlags(scriptId, { is_published: !isPublished }, rawReason, expectedUpdatedAt, "官网发布状态修改失败")
}

export async function toggleScriptFeatured(
  scriptId: string,
  isFeatured: boolean,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  return updateScriptFlags(scriptId, { is_featured: !isFeatured }, rawReason, expectedUpdatedAt, "官网精选状态修改失败")
}

export async function archiveScript(scriptId: string, rawReason: string, expectedUpdatedAt: string) {
  const admin = await requireAdmin()
  if (!validRevision(expectedUpdatedAt)) return { error: "页面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: admin.id,
      archive_reason: reasonResult.reason,
      is_published: false,
      is_player_visible: false,
      show_on_player_activity: false,
      pin_in_social_library: false,
      audit_reason: reasonResult.reason,
    })
    .eq("id", scriptId)
    .eq("updated_at", expectedUpdatedAt)
    .is("archived_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[archiveScript]", error)
    return { error: "移入回收站失败" }
  }
  if (!data) return { error: "剧本已被其他管理员修改，请刷新后重试" }
  revalidateScriptPaths(scriptId)
  return { success: true }
}

export async function restoreScript(scriptId: string, rawReason: string, expectedUpdatedAt: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "只有超级管理员可以恢复剧本" }
  if (!validRevision(expectedUpdatedAt)) return { error: "页面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .update({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      audit_reason: reasonResult.reason,
    })
    .eq("id", scriptId)
    .eq("updated_at", expectedUpdatedAt)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("[restoreScript]", error)
    return { error: "恢复失败" }
  }
  if (!data) return { error: "剧本已被其他管理员修改，请刷新后重试" }
  revalidateScriptPaths(scriptId)
  return { success: true }
}

export async function permanentlyDeleteScript(
  scriptId: string,
  rawReason: string,
  expectedUpdatedAt: string,
) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "只有超级管理员可以永久删除剧本" }
  if (!validRevision(expectedUpdatedAt)) return { error: "页面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  if (!(await contentMediaCleanupOutboxIsReady())) {
    return { error: "数据库尚未应用内容管理 V2 Contract，已停止永久删除" }
  }

  const supabase = await createClient()
  const { data: script, error: lookupError } = await supabase
    .from("scripts")
    .select("archived_at, updated_at")
    .eq("id", scriptId)
    .maybeSingle()
  if (lookupError) return { error: "删除前读取剧本状态失败" }
  if (!script?.archived_at) return { error: "请先将剧本移入回收站" }
  if (script.updated_at !== expectedUpdatedAt) return { error: "剧本已被其他管理员修改，请刷新后重试" }

  const { error } = await supabase.rpc("admin_hard_delete_script_v2", {
    p_script_id: scriptId,
    p_reason: reasonResult.reason,
    p_expected_updated_at: expectedUpdatedAt,
  })
  if (error) {
    console.error("[permanentlyDeleteScript]", error)
    if (error.code === "40001" || error.message?.includes("CONTENT_MANAGEMENT_VERSION_CONFLICT")) {
      return { error: "剧本已被其他管理员修改，请刷新后重试" }
    }
    if (error.message?.includes("CONTENT_MANAGEMENT_NOT_ARCHIVED")) {
      return { error: "剧本已被恢复或状态已变化，请刷新后重试" }
    }
    return { error: "永久删除失败" }
  }

  revalidateScriptPaths(scriptId)
  const cleanupResult = await runContentMediaCleanupJobsForContent("script", scriptId)
  if (cleanupResult.error) {
    return {
      success: true,
      warning: "记录已永久删除，但仍有文件待清理；任务已保存在回收站页面，可安全重试。",
    }
  }
  return { success: true }
}

async function updateScriptFlags(
  scriptId: string,
  flags: Pick<TablesUpdate<"scripts">, "is_published" | "is_featured">,
  rawReason: string,
  expectedUpdatedAt: string,
  failureMessage: string,
) {
  await requireAdmin()
  if (!validRevision(expectedUpdatedAt)) return { error: "页面版本信息无效，请刷新后重试" }
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .update({ ...flags, audit_reason: reasonResult.reason })
    .eq("id", scriptId)
    .eq("updated_at", expectedUpdatedAt)
    .is("archived_at", null)
    .select("id, updated_at")
    .maybeSingle()
  if (error) {
    console.error("[updateScriptFlags]", error)
    return { error: failureMessage }
  }
  if (!data) return { error: "剧本已被其他管理员修改，请刷新后重试" }
  revalidateScriptPaths(scriptId)
  return { success: true, updatedAt: data.updated_at }
}

function validExpectedVersions(value: unknown): value is ExpectedScriptVersions {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<ExpectedScriptVersions>
  return validRevision(candidate.scriptUpdatedAt)
    && (candidate.protectedUpdatedAt === null || validRevision(candidate.protectedUpdatedAt))
}

function validRevision(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 50 && !Number.isNaN(Date.parse(value))
}

function validateScriptNumbers(data: UpdateData) {
  const min = data.player_count_min as number | undefined
  const max = data.player_count_max as number | undefined
  const duration = data.duration_minutes as number | undefined
  if (min !== undefined && min < 1) return "最少人数不能小于 1"
  if (min !== undefined && max !== undefined && max < min) return "最多人数不能小于最少人数"
  if (duration !== undefined && duration < 1) return "时长不能小于 1 分钟"
  for (const [value, label] of [
    [data.player_activity_order, "活动父菜单排序"],
    [data.social_library_order, "社交剧本库排序"],
  ] as const) {
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > 999_999)) {
      return `${label}必须是 -999999 到 999999 之间的整数`
    }
  }
  return null
}

function revalidateScriptPaths(scriptId: string) {
  for (const path of [
    "/", "/scripts", "/scripts/library", "/admin/scripts",
    `/admin/scripts/${scriptId}`, `/admin/scripts/${scriptId}/edit`,
    "/app/scripts", "/app/scripts/large", "/app/scripts/social", "/app/scripts/library",
    `/app/scripts/${scriptId}`,
  ]) revalidatePath(path)
}
