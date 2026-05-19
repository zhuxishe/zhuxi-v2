"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { imageExtension, validateSafeImageFile } from "@/lib/file-validation"

const COVER_EXTENSIONS = ["jpg", "png", "webp"] as const

export async function uploadScriptCover(scriptId: string, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()
  const file = formData.get("file") as File
  if (!file) return { error: "文件不能为空" }
  const validation = await validateSafeImageFile(file)
  if (!validation.valid) return { error: validation.error }
  if (file.size > 5 * 1024 * 1024) return { error: "文件大小不能超过 5MB" }
  const ext = imageExtension(file.type)
  if (!ext) return { error: "仅支持 JPG / PNG / WebP" }

  const path = `covers/${scriptId}.${ext}`
  await supabase.storage
    .from("scripts-covers")
    .remove(COVER_EXTENSIONS.filter((oldExt) => oldExt !== ext).map((oldExt) => `covers/${scriptId}.${oldExt}`))
  const { error: uploadError } = await supabase.storage
    .from("scripts-covers")
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) {
    console.error("[uploadScriptCover]", uploadError)
    return { error: "操作失败" }
  }

  const { data: urlData } = supabase.storage.from("scripts-covers").getPublicUrl(path)
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

export async function uploadScriptPdf(scriptId: string, formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()
  const file = formData.get("file") as File
  if (!file) return { error: "文件不能为空" }
  if (file.type !== "application/pdf") return { error: "仅支持 PDF 格式" }
  if (file.size > 50 * 1024 * 1024) return { error: "文件大小不能超过 50MB" }

  const path = `pdfs/${scriptId}/original.pdf`
  const { error: uploadError } = await supabase.storage.from("scripts").upload(path, file, { upsert: true })
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

  const { error: dbError } = await supabase.from("scripts").update({ pdf_url: signedData.signedUrl }).eq("id", scriptId)
  if (dbError) {
    console.error("[uploadScriptPdf:db]", dbError)
    return { error: "操作失败" }
  }
  return { success: true, url: signedData.signedUrl }
}
