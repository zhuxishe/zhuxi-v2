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
