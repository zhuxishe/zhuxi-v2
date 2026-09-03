"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import { managedContentImageUrlIsCanonical } from "@/lib/content-media-url"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"

interface RoleInput {
  name: string
  gender: string
  description: string
}

interface ScriptInput {
  request_id: string
  title: string
  title_ja: string
  description: string
  author: string
  cover_url: string | null
  player_count_min: number
  player_count_max: number
  duration_minutes: number
  difficulty: string
  genre_tags: string[]
  theme_tags: string[]
  content_html: string
  warnings: string[]
  roles: RoleInput[]
  is_published: boolean
  is_player_visible: boolean
  is_social_script: boolean
  show_on_player_activity: boolean
  player_activity_order: number
  pin_in_social_library: boolean
  social_library_order: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function createScript(input: ScriptInput, rawReason: string) {
  const admin = await requireAdmin()
  const reasonResult = normalizeAdminAuditReason(rawReason)
  if (!reasonResult.ok) return { error: reasonResult.error }

  // 服务端输入校验
  if (!UUID_PATTERN.test(input.request_id)) return { error: "新建请求编号无效，请刷新页面后重试" }
  if (!input.title?.trim()) return { error: "标题不能为空" }
  if (input.title.length > 200) return { error: "标题不能超过 200 字符" }
  if (input.title_ja && input.title_ja.length > 200) return { error: "日文标题不能超过 200 字符" }
  if (input.description && input.description.length > 2000) return { error: "描述不能超过 2000 字符" }
  if (input.author && input.author.length > 100) return { error: "作者不能超过 100 字符" }
  if (input.cover_url && !isAllowedExternalImageUrl(input.cover_url)) return { error: "外部封面必须使用有效的 HTTPS 链接" }
  if (input.player_count_min < 1) return { error: "最少人数不能小于 1" }
  if (input.player_count_max < input.player_count_min) return { error: "最多人数不能小于最少人数" }
  if (input.duration_minutes < 1) return { error: "时长不能小于 1 分钟" }
  if (!Number.isInteger(input.player_activity_order) || Math.abs(input.player_activity_order) > 999_999) {
    return { error: "活动父菜单排序必须是 -999999 到 999999 之间的整数" }
  }
  if (!Number.isInteger(input.social_library_order) || Math.abs(input.social_library_order) > 999_999) {
    return { error: "社交剧本库排序必须是 -999999 到 999999 之间的整数" }
  }

  const supabase = await createClient()
  const isSocialScript = Boolean(input.is_social_script)
  const isPlayerVisible = Boolean(input.is_player_visible)
  const metadataPayload = {
    id: input.request_id,
    title: input.title.trim(),
    title_ja: input.title_ja.trim() || null,
    description: input.description.trim() || null,
    author: input.author.trim() || null,
    cover_url: input.cover_url,
    player_count_min: input.player_count_min,
    player_count_max: input.player_count_max,
    duration_minutes: input.duration_minutes,
    difficulty: input.difficulty,
    genre_tags: input.genre_tags,
    theme_tags: input.theme_tags,
    warnings: input.warnings,
    is_published: input.is_published,
    is_player_visible: isPlayerVisible,
    is_social_script: isSocialScript,
    show_on_player_activity: isPlayerVisible && isSocialScript && input.show_on_player_activity,
    player_activity_order: input.player_activity_order,
    pin_in_social_library: isPlayerVisible && isSocialScript && input.pin_in_social_library,
    social_library_order: input.social_library_order,
    created_by: admin.id,
  }

  const { data, error } = await supabase
    .from("scripts")
    .insert({
      ...metadataPayload,
      audit_reason: reasonResult.reason,
    })
    .select("id")
    .single()

  let scriptId = data?.id
  let shouldWriteProtected = true
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("scripts")
      .select("id, title, title_ja, description, author, cover_url, player_count_min, player_count_max, duration_minutes, difficulty, genre_tags, theme_tags, warnings, is_published, is_player_visible, is_social_script, show_on_player_activity, player_activity_order, pin_in_social_library, social_library_order, created_by, archived_at")
      .eq("id", input.request_id)
      .maybeSingle()
    if (existingError || !existing || existing.archived_at || !creationMetadataMatches(existing, metadataPayload)) {
      return { error: "新建请求编号已被占用，请刷新页面后重试" }
    }
    scriptId = existing.id
    const { data: protectedContent, error: protectedLookupError } = await supabase
      .from("script_protected_content")
      .select("core_content_html, roles")
      .eq("script_id", scriptId)
      .maybeSingle()
    if (protectedLookupError) return { error: "读取已保存草稿内容失败", scriptId }
    if (protectedContent) {
      if (
        protectedContent.core_content_html !== input.content_html
        || !sameJson(protectedContent.roles, input.roles)
      ) return { error: "该新建请求已保存过不同的完整内容，请从剧本列表进入编辑", scriptId }
      shouldWriteProtected = false
    }
  } else if (error) {
    console.error("[createScript]", error)
    return { error: "操作失败" }
  }
  if (!scriptId) return { error: "新建请求编号已被占用，请刷新页面后重试" }
  const { error: protectedError } = shouldWriteProtected
    ? await supabase
      .from("script_protected_content")
      .upsert({
        script_id: scriptId,
        core_content_html: input.content_html,
        roles: input.roles as unknown as import("@/types/database.types").Json,
        audit_reason: reasonResult.reason,
      }, { onConflict: "script_id" })
    : { error: null }
  if (protectedError) {
    console.error("[createScript:protected]", protectedError)
    return {
      error: "基本信息已保存为草稿，但完整内容保存失败。请从剧本列表重新进入并保存内容。",
      scriptId,
    }
  }
  revalidatePath("/admin/scripts")
  return { success: true, scriptId }
}

function creationMetadataMatches(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  return Object.entries(expected).every(([key, value]) => sameJson(existing[key], value))
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isAllowedExternalImageUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && managedContentImageUrlIsCanonical(value) === null
  } catch {
    return false
  }
}
