import { requireAdmin } from "@/lib/auth/admin"
import { sanitizePostgrestValue } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

export const ADMIN_SCRIPT_PAGE_SIZE = 24
const ADMIN_SIGNED_URL_TTL_SECONDS = 15 * 60

export type AdminScriptView = "current" | "archived"
export type AdminScriptStatus = "all" | "published" | "draft"
export type AdminScriptSurface = "all" | "public" | "player" | "hidden"
export type AdminScriptKind = "all" | "social" | "other"

export interface AdminScriptFilters {
  page?: number
  query?: string
  view?: AdminScriptView
  status?: AdminScriptStatus
  surface?: AdminScriptSurface
  kind?: AdminScriptKind
}

export interface AdminScriptProtectedContent {
  core_content_html: string | null
  roles: Json | null
  pdf_storage_path: string | null
  page_image_paths: string[]
  page_count: number
  updated_at: string | null
}

/**
 * Admin-only list projection. Sensitive script content never travels through
 * the list query, which keeps the admin index light and avoids accidental
 * exposure when list code is reused.
 */
export async function fetchAdminScriptsV2(filters: AdminScriptFilters = {}) {
  await requireAdmin()
  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)
  const from = (page - 1) * ADMIN_SCRIPT_PAGE_SIZE
  const to = from + ADMIN_SCRIPT_PAGE_SIZE - 1

  let query = supabase
    .from("scripts")
    .select(
      "id, title, title_ja, author, description, cover_url, player_count_min, player_count_max, duration_minutes, is_published, is_featured, is_player_visible, is_social_script, show_on_player_activity, player_activity_order, pin_in_social_library, social_library_order, archived_at, created_at, updated_at",
      { count: "exact" },
    )
    .order(filters.view === "archived" ? "archived_at" : "created_at", {
      ascending: false,
      nullsFirst: false,
    })
    .range(from, to)

  query = filters.view === "archived"
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null)

  const search = filters.query?.trim()
  if (search) {
    const safe = sanitizePostgrestValue(search.slice(0, 100))
    query = query.or(`title.ilike.%${safe}%,title_ja.ilike.%${safe}%,author.ilike.%${safe}%`)
  }
  if (filters.status === "published") query = query.eq("is_published", true)
  if (filters.status === "draft") query = query.eq("is_published", false)
  if (filters.surface === "public") query = query.eq("is_published", true)
  if (filters.surface === "player") query = query.eq("is_player_visible", true)
  if (filters.surface === "hidden") {
    query = query.eq("is_published", false).eq("is_player_visible", false)
  }
  if (filters.kind === "social") query = query.eq("is_social_script", true)
  if (filters.kind === "other") query = query.eq("is_social_script", false)

  const { data, error, count } = await query
  if (error) throw error
  return { scripts: data ?? [], total: count ?? 0, page }
}

/** Admin detail including protected content and short-lived preview URLs. */
export async function fetchAdminScriptV2(scriptId: string) {
  await requireAdmin()
  const supabase = await createClient()
  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select(
      "id, title, title_ja, author, description, player_count_min, player_count_max, duration_minutes, difficulty, genre_tags, theme_tags, warnings, cover_url, is_published, is_featured, budget, location, is_player_visible, is_social_script, show_on_player_activity, player_activity_order, pin_in_social_library, social_library_order, archived_at, archived_by, archive_reason, created_at, updated_at",
    )
    .eq("id", scriptId)
    .maybeSingle()

  if (scriptError) throw scriptError
  if (!script) return null

  const { data: protectedContent, error: protectedError } = await supabase
    .from("script_protected_content")
    .select("core_content_html, roles, pdf_storage_path, page_image_paths, page_count, updated_at")
    .eq("script_id", scriptId)
    .maybeSingle()

  if (protectedError) throw protectedError
  const content: AdminScriptProtectedContent = {
    core_content_html: protectedContent?.core_content_html ?? null,
    roles: protectedContent?.roles ?? null,
    pdf_storage_path: protectedContent?.pdf_storage_path ?? null,
    page_image_paths: protectedContent?.page_image_paths ?? [],
    page_count: protectedContent?.page_count ?? 0,
    updated_at: protectedContent?.updated_at ?? null,
  }

  const storage = createAdminClient().storage.from("scripts")
  const pageImages = await signPaths(storage, content.page_image_paths)
  let pdfUrl: string | null = null
  if (content.pdf_storage_path) {
    const { data } = await storage.createSignedUrl(
      content.pdf_storage_path,
      ADMIN_SIGNED_URL_TTL_SECONDS,
    )
    pdfUrl = data?.signedUrl ?? null
  }

  return {
    ...script,
    content_html: content.core_content_html,
    roles: content.roles,
    pdf_url: pdfUrl,
    page_images: pageImages,
    pdf_storage_path: content.pdf_storage_path,
    page_image_paths: content.page_image_paths,
    page_count: content.page_count,
    protected_updated_at: content.updated_at,
  }
}

async function signPaths(
  storage: ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>,
  paths: string[],
) {
  if (paths.length === 0) return []
  const { data, error } = await storage.createSignedUrls(
    paths,
    ADMIN_SIGNED_URL_TTL_SECONDS,
  )
  if (error) {
    console.error("[fetchAdminScriptV2:signPages]", error)
    return paths.map(() => "")
  }
  return paths.map((_, index) => data[index]?.signedUrl ?? "")
}
