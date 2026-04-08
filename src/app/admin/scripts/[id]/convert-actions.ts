"use server"

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

  if (error) return { error: error.message }
  return { success: true }
}
