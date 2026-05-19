"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

interface RoleInput {
  name: string
  gender: string
  description: string
}

interface ScriptInput {
  title: string
  title_ja: string
  description: string
  author: string
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
}

export async function createScript(input: ScriptInput) {
  const admin = await requireAdmin()

  // 服务端输入校验
  if (!input.title?.trim()) return { error: "标题不能为空" }
  if (input.title.length > 200) return { error: "标题不能超过 200 字符" }
  if (input.title_ja && input.title_ja.length > 200) return { error: "日文标题不能超过 200 字符" }
  if (input.description && input.description.length > 2000) return { error: "描述不能超过 2000 字符" }
  if (input.author && input.author.length > 100) return { error: "作者不能超过 100 字符" }
  if (input.player_count_min < 1) return { error: "最少人数不能小于 1" }
  if (input.player_count_max < input.player_count_min) return { error: "最多人数不能小于最少人数" }
  if (input.duration_minutes < 1) return { error: "时长不能小于 1 分钟" }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .insert({
      title: input.title,
      title_ja: input.title_ja,
      description: input.description,
      author: input.author,
      player_count_min: input.player_count_min,
      player_count_max: input.player_count_max,
      duration_minutes: input.duration_minutes,
      difficulty: input.difficulty,
      genre_tags: input.genre_tags,
      theme_tags: input.theme_tags,
      content_html: input.content_html,
      warnings: input.warnings,
      roles: input.roles as unknown as import("@/types/database.types").Json,
      is_published: input.is_published,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[createScript]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/scripts")
  return { success: true, scriptId: data.id }
}
