"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"

interface StaffProfileInput {
  name: string
  school: string
  major: string
  intro: string
  avatar_url?: string
  is_published?: boolean
  sort_order?: number
}

const ALLOWED_UPDATE_FIELDS = new Set([
  "name",
  "school",
  "major",
  "intro",
  "avatar_url",
  "is_published",
  "sort_order",
])

function validateStaffInput(input: Partial<StaffProfileInput>) {
  if ("name" in input && !input.name?.trim()) return "姓名不能为空"
  if ("school" in input && !input.school?.trim()) return "学校不能为空"
  if ("major" in input && !input.major?.trim()) return "专业不能为空"
  if ("intro" in input && !input.intro?.trim()) return "一句话简介不能为空"
  if (input.name && input.name.length > 100) return "姓名不能超过 100 字符"
  if (input.school && input.school.length > 120) return "学校不能超过 120 字符"
  if (input.major && input.major.length > 160) return "专业不能超过 160 字符"
  if (input.intro && input.intro.length > 240) return "一句话简介不能超过 240 字符"
  if (input.avatar_url && input.avatar_url.length > 1000) return "头像 URL 过长"
  if (input.sort_order !== undefined && (input.sort_order < 0 || input.sort_order > 9999)) {
    return "排序值必须在 0-9999 之间"
  }
  return null
}

function revalidateStaffPaths() {
  revalidatePath("/")
  revalidatePath("/admin/staff")
}

export async function createStaffProfile(input: StaffProfileInput) {
  await requireAdmin()
  const validationError = validateStaffInput(input)
  if (validationError) return { error: validationError }

  const supabase = createAdminClient()
  const { error } = await supabase.from("staff_profiles").insert({
    name: input.name.trim(),
    school: input.school.trim(),
    major: input.major.trim(),
    intro: input.intro.trim(),
    avatar_url: input.avatar_url?.trim() || null,
    is_published: input.is_published ?? true,
    sort_order: input.sort_order ?? 0,
  })

  if (error) {
    console.error("[createStaffProfile]", error)
    return { error: "操作失败" }
  }
  revalidateStaffPaths()
  return { success: true }
}

export async function updateStaffProfile(id: string, input: Partial<StaffProfileInput>) {
  await requireAdmin()
  const validationError = validateStaffInput(input)
  if (validationError) return { error: validationError }

  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) continue
    filtered[key] = typeof value === "string" ? value.trim() || null : value
  }
  if (Object.keys(filtered).length === 0) return { error: "无有效更新字段" }

  const supabase = createAdminClient()
  const { error } = await supabase.from("staff_profiles").update(filtered).eq("id", id)

  if (error) {
    console.error("[updateStaffProfile]", error)
    return { error: "操作失败" }
  }
  revalidateStaffPaths()
  return { success: true }
}

export async function deleteStaffProfile(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from("staff_profiles").delete().eq("id", id)

  if (error) {
    console.error("[deleteStaffProfile]", error)
    return { error: "操作失败" }
  }
  revalidateStaffPaths()
  return { success: true }
}

export async function toggleStaffProfilePublished(id: string, isPublished: boolean) {
  await requireAdmin()
  return updateStaffProfile(id, { is_published: isPublished })
}
