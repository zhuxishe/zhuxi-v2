"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { revalidatePath } from "next/cache"

interface TestimonialInput {
  name: string
  school?: string
  quote: string
  is_published?: boolean
  sort_order?: number
}

export async function createTestimonial(input: TestimonialInput) {
  await requireAdmin()

  if (!input.name?.trim()) return { error: "姓名不能为空" }
  if (input.name.length > 100) return { error: "姓名不能超过 100 字符" }
  if (input.school && input.school.length > 200) return { error: "学校不能超过 200 字符" }
  if (!input.quote?.trim()) return { error: "引言不能为空" }
  if (input.quote.length > 500) return { error: "引言不能超过 500 字符" }
  if (input.sort_order !== undefined && (input.sort_order < 0 || input.sort_order > 9999)) return { error: "排序值必须在 0-9999 之间" }

  const supabase = createAdminClient()

  const { error } = await supabase.from("testimonials").insert({
    name: input.name,
    school: input.school || null,
    quote: input.quote,
    is_published: input.is_published ?? true,
    sort_order: input.sort_order ?? 0,
  })

  if (error) {
    console.error("[createTestimonial]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}

const ALLOWED_UPDATE_FIELDS = new Set(["name", "school", "quote", "is_published", "sort_order"])

export async function updateTestimonial(id: string, input: Partial<TestimonialInput>) {
  await requireAdmin()
  const supabase = createAdminClient()

  // 字段白名单过滤
  const filtered: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(input)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) filtered[key] = val
  }
  if (Object.keys(filtered).length === 0) return { error: "无有效更新字段" }

  const { error } = await supabase
    .from("testimonials")
    .update(filtered)
    .eq("id", id)

  if (error) {
    console.error("[updateTestimonial]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}

export async function deleteTestimonial(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from("testimonials")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("[deleteTestimonial]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}

export async function toggleTestimonialPublished(id: string, is_published: boolean) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from("testimonials")
    .update({ is_published })
    .eq("id", id)

  if (error) {
    console.error("[toggleTestimonialPublished]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}
