"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { validateHomepageSchoolStatsDraft, type HomepageSchoolStatsDraft } from "@/lib/homepage-school-stats"
import type { Json } from "@/types/database.types"

export type HomepageStatsActionResult =
  | { ok: true; version: number }
  | { ok: false; error: string }

function friendlyRpcError(message: string, fallback: string) {
  if (message.includes("HOMEPAGE_SCHOOL_STATS_SUPER_ADMIN_REQUIRED")) return "仅超级管理员可以发布主页统计"
  if (message.includes("HOMEPAGE_SCHOOL_STATS_INVALID_INPUT")) return "统计数据未通过校验，请检查人数和学校信息"
  if (message.includes("HOMEPAGE_SCHOOL_STATS_VERSION_CONFLICT")) return "配置已被其他管理员更新，请刷新页面后再操作"
  if (message.includes("HOMEPAGE_SCHOOL_STATS_NOT_CONFIGURED")) return "数据库尚未建立主页统计配置"
  if (message.includes("HOMEPAGE_SCHOOL_STATS_HISTORY_NOT_FOUND")) return "要恢复的历史版本不存在"
  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeDraft(value: unknown): HomepageSchoolStatsDraft | null {
  if (!isRecord(value)
    || typeof value.totalMembers !== "number"
    || typeof value.totalSchools !== "number"
    || !Array.isArray(value.featuredSchools)
  ) return null

  const featuredSchools = []
  for (const school of value.featuredSchools) {
    if (!isRecord(school)
      || Object.keys(school).sort().join(",") !== "count,id,ja,zh"
      || typeof school.id !== "string"
      || typeof school.zh !== "string"
      || typeof school.ja !== "string"
      || typeof school.count !== "number"
    ) return null

    featuredSchools.push({
      id: school.id,
      zh: school.zh.trim(),
      ja: school.ja.trim(),
      count: school.count,
    })
  }

  return {
    totalMembers: value.totalMembers,
    totalSchools: value.totalSchools,
    featuredSchools,
  }
}

function revalidateHomepageStats() {
  revalidatePath("/")
  revalidatePath("/admin/homepage-stats")
}

export async function publishHomepageSchoolStats(
  draft: HomepageSchoolStatsDraft,
  expectedVersion: number,
): Promise<HomepageStatsActionResult> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { ok: false, error: "仅超级管理员可以发布主页统计" }

  const normalizedDraft = normalizeDraft(draft)
  if (!normalizedDraft) return { ok: false, error: "统计数据格式无效" }
  const validation = validateHomepageSchoolStatsDraft(normalizedDraft)
  if (!validation.valid) return { ok: false, error: validation.errors[0] ?? "统计数据未通过校验" }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return { ok: false, error: "当前版本无效，请刷新页面后重试" }
  }

  let publishedVersion: number
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("publish_homepage_school_stats", {
      p_total_members: normalizedDraft.totalMembers,
      p_total_schools: normalizedDraft.totalSchools,
      p_featured_schools: normalizedDraft.featuredSchools as unknown as Json,
      p_expected_version: expectedVersion,
    })

    if (error) {
      console.error("[publishHomepageSchoolStats]", error)
      return { ok: false, error: friendlyRpcError(error.message, "发布失败，请稍后重试") }
    }
    if (data == null || !Number.isSafeInteger(Number(data))) return { ok: false, error: "发布成功但未返回新版本，请刷新确认" }
    publishedVersion = Number(data)
  } catch (error) {
    console.error("[publishHomepageSchoolStats]", error)
    return { ok: false, error: "发布失败，请检查网络后重试" }
  }

  revalidateHomepageStats()
  return { ok: true, version: publishedVersion }
}

export async function restoreHomepageSchoolStats(
  historyId: number | string,
  expectedVersion: number,
): Promise<HomepageStatsActionResult> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { ok: false, error: "仅超级管理员可以恢复主页统计" }

  const normalizedHistoryId = Number(historyId)
  if (!Number.isSafeInteger(normalizedHistoryId) || normalizedHistoryId < 1) {
    return { ok: false, error: "历史版本识别信息无效" }
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return { ok: false, error: "当前版本无效，请刷新页面后重试" }
  }

  let restoredVersion: number
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("restore_homepage_school_stats", {
      p_history_id: normalizedHistoryId,
      p_expected_version: expectedVersion,
    })

    if (error) {
      console.error("[restoreHomepageSchoolStats]", error)
      return { ok: false, error: friendlyRpcError(error.message, "恢复失败，请稍后重试") }
    }
    if (data == null || !Number.isSafeInteger(Number(data))) return { ok: false, error: "恢复成功但未返回新版本，请刷新确认" }
    restoredVersion = Number(data)
  } catch (error) {
    console.error("[restoreHomepageSchoolStats]", error)
    return { ok: false, error: "恢复失败，请检查网络后重试" }
  }

  revalidateHomepageStats()
  return { ok: true, version: restoredVersion }
}
