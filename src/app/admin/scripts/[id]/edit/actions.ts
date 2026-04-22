"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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
  "is_featured",
  "budget",
  "location",
  "roles",
  "warnings",
] as const

type UpdateData = Record<string, string | number | boolean | string[] | Json | null>

export async function updateScript(scriptId: string, data: UpdateData) {
  await requireAdmin()

  // 服务端数值校验
  const min = data.player_count_min as number | undefined
  const max = data.player_count_max as number | undefined
  const dur = data.duration_minutes as number | undefined
  if (min !== undefined && min < 1) return { error: "最少人数不能小于 1" }
  if (min !== undefined && max !== undefined && max < min) return { error: "最多人数不能小于最少人数" }
  if (dur !== undefined && dur < 1) return { error: "时长不能小于 1 分钟" }

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

  if (error) {
    console.error("[updateScript]", error)
    return { error: "操作失败" }
  }
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

  if (error) {
    console.error("[toggleScriptPublish]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/admin/scripts")
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true }
}

export async function toggleScriptFeatured(scriptId: string, isFeatured: boolean) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("scripts")
    .update({ is_featured: !isFeatured })
    .eq("id", scriptId)

  if (error) {
    console.error("[toggleScriptFeatured]", error)
    return { error: "操作失败" }
  }
  revalidatePath("/")
  revalidatePath("/admin/scripts")
  revalidatePath(`/admin/scripts/${scriptId}`)
  return { success: true }
}

/** 删除剧本（关联记录 CASCADE 清理） + Storage 文件清理 */
export async function deleteScript(scriptId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // 先读取文件路径，删除后无法获取
  const { data: script } = await supabase
    .from("scripts")
    .select("cover_url, pdf_url")
    .eq("id", scriptId)
    .single()

  const { error } = await supabase
    .from("scripts")
    .delete()
    .eq("id", scriptId)

  if (error) {
    console.error("[deleteScript]", error)
    return { error: "操作失败" }
  }

  // 尝试清理 Storage 文件（失败不阻止操作）
  if (script) {
    const filePaths = [script.cover_url, script.pdf_url]
      .filter((url): url is string => !!url)
      .map(extractStoragePath)
      .filter((p): p is string => !!p)

    if (filePaths.length > 0) {
      try {
        const admin = createAdminClient()
        await admin.storage.from("scripts").remove(filePaths)
      } catch (e) {
        console.warn("Storage cleanup failed for script", scriptId, e)
      }
    }
  }

  revalidatePath("/admin/scripts")
  return { success: true }
}

/** 从 Supabase Storage public URL 中提取 bucket 内的相对路径 */
function extractStoragePath(url: string): string | null {
  try {
    const marker = "/storage/v1/object/public/scripts/"
    const idx = url.indexOf(marker)
    if (idx !== -1) return url.slice(idx + marker.length)
    return null
  } catch {
    return null
  }
}
