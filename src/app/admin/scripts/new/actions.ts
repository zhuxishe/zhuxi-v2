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
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .insert({
      ...input,
      roles: input.roles as unknown as import("@/types/database.types").Json,
      created_by: admin.id,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
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

  const path = `covers/${scriptId}.webp`

  const { error: uploadError } = await supabase.storage
    .from("scripts-covers")
    .upload(path, file, { upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: urlData } = supabase.storage
    .from("scripts-covers")
    .getPublicUrl(path)

  const { error: dbError } = await supabase
    .from("scripts")
    .update({ cover_url: urlData.publicUrl })
    .eq("id", scriptId)

  if (dbError) return { error: dbError.message }
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

  const path = `pdfs/${scriptId}/original.pdf`

  const { error: uploadError } = await supabase.storage
    .from("scripts")
    .upload(path, file, { upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: signedData, error: signError } = await supabase.storage
    .from("scripts")
    .createSignedUrl(path, 3600 * 24 * 365)

  if (signError) return { error: signError.message }

  const { error: dbError } = await supabase
    .from("scripts")
    .update({ pdf_url: signedData.signedUrl })
    .eq("id", scriptId)

  if (dbError) return { error: dbError.message }
  return { success: true, url: signedData.signedUrl }
}
