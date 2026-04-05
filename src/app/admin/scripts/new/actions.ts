"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

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
  is_published: boolean
}

export async function createScript(input: ScriptInput) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .insert({
      ...input,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  return { success: true, scriptId: data.id }
}

export async function uploadScriptFile(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const file = formData.get("file") as File
  const folder = formData.get("folder") as string // "covers" or "pdfs"
  if (!file) return { error: "文件不能为空" }

  const ext = file.name.split(".").pop()
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from("scripts")
    .upload(fileName, file)

  if (error) return { error: error.message }

  const { data: urlData } = supabase.storage
    .from("scripts")
    .getPublicUrl(fileName)

  return { success: true, url: urlData.publicUrl }
}

export async function updateScriptUrls(scriptId: string, urls: { cover_url?: string; pdf_url?: string }) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("scripts")
    .update(urls)
    .eq("id", scriptId)

  if (error) return { error: error.message }
  return { success: true }
}
