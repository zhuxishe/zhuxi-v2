"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CommunityContentStatus, CommunityFaqInput } from "@/components/admin/community/types"

const QA_PATH = "/admin/community/qa"

function optionalText(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function completePair(first: string | undefined, second: string | undefined) {
  return Boolean(first?.trim()) === Boolean(second?.trim())
}

function validateFaq(input: CommunityFaqInput) {
  if (!completePair(input.question_zh, input.answer_zh)) return "中文问题和答案需要同时填写"
  if (!completePair(input.question_ja, input.answer_ja)) return "日文问题和答案需要同时填写"
  if (!input.question_zh?.trim() && !input.question_ja?.trim()) return "至少完整填写一个语言版本"
  if (input.question_zh && input.question_zh.trim().length > 500) return "中文问题不能超过 500 个字符"
  if (input.question_ja && input.question_ja.trim().length > 500) return "日文问题不能超过 500 个字符"
  if (!Number.isInteger(input.sort_order) || Math.abs(input.sort_order) > 999_999) return "排序值必须是 -999999 到 999999 之间的整数"
  return null
}

function faqPayload(input: CommunityFaqInput) {
  return {
    question_zh: optionalText(input.question_zh),
    answer_zh: optionalText(input.answer_zh),
    question_ja: optionalText(input.question_ja),
    answer_ja: optionalText(input.answer_ja),
    status: input.status,
    is_featured: input.is_featured,
    sort_order: input.sort_order,
  }
}

function friendlyError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205" || error.message?.includes("community_faqs")) return "社区数据库结构尚未应用"
  if (error.code === "23514") return "问答内容不完整，请检查中日文问题和答案"
  if (error.message?.includes("featured") || error.message?.includes("精选")) return "已发布的精选问答最多只能有 2 条"
  return "操作失败，请稍后重试"
}

async function ensureFeaturedLimit(id?: string) {
  const supabase = createAdminClient()
  let query = supabase
    .from("community_faqs")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("is_featured", true)
  if (id) query = query.neq("id", id)
  const { count, error } = await query
  if (error) return { error: friendlyError(error) }
  return (count ?? 0) >= 2 ? { error: "已发布的精选问答最多只能有 2 条" } : { error: null }
}

function revalidateFaqPaths() {
  revalidatePath(QA_PATH)
  revalidatePath("/admin/community")
  revalidatePath("/app/community")
}

export async function createCommunityFaq(input: CommunityFaqInput) {
  const admin = await requireAdmin()
  const validationError = validateFaq(input)
  if (validationError) return { error: validationError }
  if (input.status === "published" && input.is_featured) {
    const limit = await ensureFeaturedLimit()
    if (limit.error) return limit
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from("community_faqs").insert({
    ...faqPayload(input),
    published_at: input.status === "published" ? new Date().toISOString() : null,
    created_by: admin.id,
  })
  if (error) return { error: friendlyError(error) }
  revalidateFaqPaths()
  return { success: true as const }
}

export async function updateCommunityFaq(id: string, input: CommunityFaqInput) {
  await requireAdmin()
  const validationError = validateFaq(input)
  if (validationError) return { error: validationError }
  if (input.status === "published" && input.is_featured) {
    const limit = await ensureFeaturedLimit(id)
    if (limit.error) return limit
  }

  const supabase = createAdminClient()
  const { data: existing, error: readError } = await supabase
    .from("community_faqs")
    .select("published_at")
    .eq("id", id)
    .maybeSingle()
  if (readError) return { error: friendlyError(readError) }
  if (!existing) return { error: "问答不存在或已被删除" }

  const { error } = await supabase
    .from("community_faqs")
    .update({
      ...faqPayload(input),
      published_at: input.status === "published" ? existing.published_at ?? new Date().toISOString() : existing.published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { error: friendlyError(error) }
  revalidateFaqPaths()
  return { success: true as const }
}

export async function setCommunityFaqStatus(id: string, status: CommunityContentStatus) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { data: existing, error: readError } = await supabase
    .from("community_faqs")
    .select("published_at, is_featured")
    .eq("id", id)
    .maybeSingle()
  if (readError) return { error: friendlyError(readError) }
  if (!existing) return { error: "问答不存在或已被删除" }
  if (status === "published" && existing.is_featured) {
    const limit = await ensureFeaturedLimit(id)
    if (limit.error) return limit
  }
  const { error } = await supabase
    .from("community_faqs")
    .update({
      status,
      published_at: status === "published" ? existing.published_at ?? new Date().toISOString() : existing.published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { error: friendlyError(error) }
  revalidateFaqPaths()
  return { success: true as const }
}

export async function setCommunityFaqFeatured(id: string, featured: boolean) {
  await requireAdmin()
  const supabase = createAdminClient()
  if (featured) {
    const { data, error } = await supabase.from("community_faqs").select("status").eq("id", id).maybeSingle()
    if (error) return { error: friendlyError(error) }
    if (!data) return { error: "问答不存在或已被删除" }
    if (data.status === "published") {
      const limit = await ensureFeaturedLimit(id)
      if (limit.error) return limit
    }
  }
  const { error } = await supabase
    .from("community_faqs")
    .update({ is_featured: featured, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: friendlyError(error) }
  revalidateFaqPaths()
  return { success: true as const }
}

export async function deleteCommunityFaq(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from("community_faqs").delete().eq("id", id)
  if (error) return { error: friendlyError(error) }
  revalidateFaqPaths()
  return { success: true as const }
}
