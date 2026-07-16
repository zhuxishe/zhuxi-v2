"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  CommunityAnnouncementInput,
  CommunityContentStatus,
} from "@/components/admin/community/types"

const ANNOUNCEMENTS_PATH = "/admin/community/announcements"

function optionalText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function parseTokyoDateTime(value: string | undefined) {
  const normalized = value?.trim()
  if (!normalized) return null
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}:00+09:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isCompleteLocale(...values: Array<string | undefined>) {
  const present = values.map((value) => Boolean(value?.trim()))
  return present.every(Boolean) || present.every((value) => !value)
}

function validateAnnouncement(input: CommunityAnnouncementInput) {
  if (!input.publisher_name?.trim()) return "发布者不能为空"
  if (input.publisher_name.trim().length > 100) return "发布者不能超过 100 个字符"
  if (!isCompleteLocale(input.title_zh, input.summary_zh, input.body_zh)) return "中文标题、摘要和正文需要同时填写"
  if (!isCompleteLocale(input.title_ja, input.summary_ja, input.body_ja)) return "日文标题、摘要和正文需要同时填写"
  const hasZh = Boolean(input.title_zh?.trim() && input.summary_zh?.trim() && input.body_zh?.trim())
  const hasJa = Boolean(input.title_ja?.trim() && input.summary_ja?.trim() && input.body_ja?.trim())
  if (!hasZh && !hasJa) return "至少完整填写一个语言版本"
  if (input.title_zh && input.title_zh.trim().length > 200) return "中文标题不能超过 200 个字符"
  if (input.title_ja && input.title_ja.trim().length > 200) return "日文标题不能超过 200 个字符"
  if (input.summary_zh && input.summary_zh.trim().length > 500) return "中文摘要不能超过 500 个字符"
  if (input.summary_ja && input.summary_ja.trim().length > 500) return "日文摘要不能超过 500 个字符"
  if (input.link_url) {
    try {
      const url = new URL(input.link_url)
      if (!['http:', 'https:'].includes(url.protocol)) return "跳转链接仅支持 http 或 https"
    } catch {
      return "跳转链接格式不正确"
    }
  }
  const start = parseTokyoDateTime(input.display_start_at)
  const end = parseTokyoDateTime(input.display_end_at)
  if (input.display_start_at && !start) return "展示开始时间格式不正确"
  if (input.display_end_at && !end) return "展示结束时间格式不正确"
  if (start && end && new Date(end) <= new Date(start)) return "展示结束时间必须晚于开始时间"
  if (!Number.isInteger(input.sort_order) || Math.abs(input.sort_order) > 999_999) return "排序值必须是 -999999 到 999999 之间的整数"
  return null
}

function announcementPayload(input: CommunityAnnouncementInput) {
  return {
    title_zh: optionalText(input.title_zh),
    summary_zh: optionalText(input.summary_zh),
    body_zh: optionalText(input.body_zh),
    title_ja: optionalText(input.title_ja),
    summary_ja: optionalText(input.summary_ja),
    body_ja: optionalText(input.body_ja),
    publisher_name: input.publisher_name.trim(),
    status: input.status,
    is_pinned: input.is_pinned,
    display_start_at: parseTokyoDateTime(input.display_start_at),
    display_end_at: parseTokyoDateTime(input.display_end_at),
    link_url: optionalText(input.link_url),
    link_text_zh: optionalText(input.link_text_zh),
    link_text_ja: optionalText(input.link_text_ja),
    notify_on_publish: input.notify_on_publish,
    sort_order: input.sort_order,
  }
}

function revalidateAnnouncementPaths() {
  revalidatePath(ANNOUNCEMENTS_PATH)
  revalidatePath("/admin/community")
  revalidatePath("/app/community")
}

function friendlyError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205" || error.message?.includes("community_announcements")) return "社区数据库结构尚未应用"
  if (error.code === "23514") return "公告内容不符合完整性要求，请检查语言版本和展示时间"
  return "操作失败，请稍后重试"
}

async function dispatchDueAnnouncementNotifications(supabase: ReturnType<typeof createAdminClient>) {
  const { error } = await supabase.rpc("community_dispatch_scheduled_announcements")
  return error ? "公告已保存，但会员通知暂未发送；系统会在下一次定时任务中重试" : null
}

export async function createCommunityAnnouncement(input: CommunityAnnouncementInput) {
  const admin = await requireAdmin()
  const validationError = validateAnnouncement(input)
  if (validationError) return { error: validationError }

  const supabase = createAdminClient()
  const payload = announcementPayload(input)
  const { error } = await supabase.from("community_announcements").insert({
    ...payload,
    published_at: input.status === "published" ? new Date().toISOString() : null,
    created_by: admin.id,
  })
  if (error) return { error: friendlyError(error) }
  const notificationWarning = input.status === "published" && input.notify_on_publish
    ? await dispatchDueAnnouncementNotifications(supabase)
    : null
  revalidateAnnouncementPaths()
  return notificationWarning ? { error: notificationWarning } : { success: true as const }
}

export async function updateCommunityAnnouncement(id: string, input: CommunityAnnouncementInput) {
  await requireAdmin()
  const validationError = validateAnnouncement(input)
  if (validationError) return { error: validationError }

  const supabase = createAdminClient()
  const { data: existing, error: readError } = await supabase
    .from("community_announcements")
    .select("status, published_at")
    .eq("id", id)
    .maybeSingle()
  if (readError) return { error: friendlyError(readError) }
  if (!existing) return { error: "公告不存在或已被删除" }

  const { error } = await supabase
    .from("community_announcements")
    .update({
      ...announcementPayload(input),
      published_at:
        input.status === "published"
          ? existing.published_at ?? new Date().toISOString()
          : existing.published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { error: friendlyError(error) }
  const notificationWarning = input.status === "published" && input.notify_on_publish
    ? await dispatchDueAnnouncementNotifications(supabase)
    : null
  revalidateAnnouncementPaths()
  return notificationWarning ? { error: notificationWarning } : { success: true as const }
}

export async function setCommunityAnnouncementStatus(id: string, status: CommunityContentStatus) {
  await requireAdmin()
  const supabase = createAdminClient()
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === "published") {
    const { data, error } = await supabase
      .from("community_announcements")
      .select("published_at")
      .eq("id", id)
      .maybeSingle()
    if (error) return { error: friendlyError(error) }
    if (!data) return { error: "公告不存在或已被删除" }
    update.published_at = data.published_at ?? new Date().toISOString()
  }
  const { error } = await supabase.from("community_announcements").update(update).eq("id", id)
  if (error) return { error: friendlyError(error) }
  const notificationWarning = status === "published"
    ? await dispatchDueAnnouncementNotifications(supabase)
    : null
  revalidateAnnouncementPaths()
  return notificationWarning ? { error: notificationWarning } : { success: true as const }
}

export async function setCommunityAnnouncementPinned(id: string, isPinned: boolean) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("community_announcements")
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: friendlyError(error) }
  revalidateAnnouncementPaths()
  return { success: true as const }
}

export async function resendCommunityAnnouncementNotification(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data, error: readError } = await supabase
    .from("community_announcements")
    .select("status")
    .eq("id", id)
    .maybeSingle()
  if (readError) return { error: friendlyError(readError) }
  if (!data) return { error: "公告不存在或已被删除" }
  if (data.status !== "published") return { error: "只有已发布公告可以再次通知" }

  const { error } = await supabase
    .from("community_announcements")
    .update({ notify_on_publish: true, notified_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: friendlyError(error) }
  const notificationWarning = await dispatchDueAnnouncementNotifications(supabase)
  revalidateAnnouncementPaths()
  return notificationWarning ? { error: notificationWarning } : { success: true as const }
}

export async function deleteCommunityAnnouncement(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from("community_announcements").delete().eq("id", id)
  if (error) return { error: friendlyError(error) }
  revalidateAnnouncementPaths()
  return { success: true as const }
}
