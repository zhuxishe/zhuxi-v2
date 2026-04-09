"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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

export async function uploadScriptCover(
  scriptId: string,
  formData: FormData
) {
  await requireAdmin()
  const supabase = createAdminClient()

  const file = formData.get("file") as File
  if (!file) return { error: "文件不能为空" }
  if (!file.type.startsWith("image/")) return { error: "仅支持图片格式" }
  if (file.size > 5 * 1024 * 1024) return { error: "文件大小不能超过 5MB" }

  const path = `covers/${scriptId}.webp`

  const { error: uploadError } = await supabase.storage
    .from("scripts-covers")
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error("[uploadScriptCover]", uploadError)
    return { error: "操作失败" }
  }

  const { data: urlData } = supabase.storage
    .from("scripts-covers")
    .getPublicUrl(path)

  const { error: dbError } = await supabase
    .from("scripts")
    .update({ cover_url: urlData.publicUrl })
    .eq("id", scriptId)

  if (dbError) {
    console.error("[uploadScriptCover:db]", dbError)
    return { error: "操作失败" }
  }
  return { success: true, url: urlData.publicUrl }
}

export async function uploadScriptPdf(
  scriptId: string,
  formData: FormData
) {
  await requireAdmin()
  const supabase = createAdminClient()

  const file = formData.get("file") as File
  if (!file) return { error: "文件不能为空" }
  if (file.type !== "application/pdf") return { error: "仅支持 PDF 格式" }
  if (file.size > 50 * 1024 * 1024) return { error: "文件大小不能超过 50MB" }

  const path = `pdfs/${scriptId}/original.pdf`

  const { error: uploadError } = await supabase.storage
    .from("scripts")
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error("[uploadScriptPdf]", uploadError)
    return { error: "操作失败" }
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from("scripts")
    .createSignedUrl(path, 3600 * 24 * 365)

  if (signError) {
    console.error("[uploadScriptPdf:sign]", signError)
    return { error: "操作失败" }
  }

  const { error: dbError } = await supabase
    .from("scripts")
    .update({ pdf_url: signedData.signedUrl })
    .eq("id", scriptId)

  if (dbError) {
    console.error("[uploadScriptPdf:db]", dbError)
    return { error: "操作失败" }
  }
  return { success: true, url: signedData.signedUrl }
}
