"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"
import type { Json } from "@/types/database.types"

const ALLOWED_FIELDS = [
  "title",
  "title_ja",
  "author",
  "description",
  "player_count_min",
  "player_count_max",
  "duration_minutes",
  "difficulty",
  "content_html",
  "content_warnings",
  "genre_tags",
  "theme_tags",
  "is_published",
  "budget",
  "location",
  "roles",
  "warnings",
] as const

type UpdateData = Record<string, string | number | boolean | string[] | Json | null>

export async function updateScript(scriptId: string, data: UpdateData) {
  await requireAdmin()
  const supabase = await createClient()

  // 白名单过滤
  const filtered: UpdateData = {}
  for (const key of Object.keys(data)) {
    if ((ALLOWED_FIELDS as readonly string[]).includes(key)) {
      filtered[key] = data[key]
    }
  }

  // roles 需要转换为 Json 类型
  if (filtered.roles) {
    filtered.roles = filtered.roles as Json
  }

  const { error } = await supabase
    .from("scripts")
    .update(filtered)
    .eq("id", scriptId)

  if (error) return { error: error.message }
  revalidatePath("/admin/scripts")
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true }
}

export async function toggleScriptPublish(scriptId: string, isPublished: boolean) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("scripts")
    .update({ is_published: !isPublished })
    .eq("id", scriptId)

  if (error) return { error: error.message }
  revalidatePath("/admin/scripts")
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true }
}
