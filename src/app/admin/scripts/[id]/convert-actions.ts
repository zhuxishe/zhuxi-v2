"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

export async function updatePageImages(
  scriptId: string,
  urls: string[],
  pageCount: number
) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("scripts")
    .update({ page_images: urls, page_count: pageCount, pdf_url: null })
    .eq("id", scriptId)

  if (error) {
    console.error("[updatePageImages]", error)
    return { error: "操作失败" }
  }
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true }
}
