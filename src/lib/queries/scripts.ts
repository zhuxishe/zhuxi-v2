import { sanitizePostgrestValue } from "@/lib/sanitize"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

const PUBLIC_SCRIPT_LIST_COLUMNS = "id, title, cover_url, genre_tags, player_count_min, player_count_max, budget, location, author, created_at" as const

const PUBLIC_SCRIPT_DETAIL_COLUMNS = "id, title, description, author, player_count_min, player_count_max, duration_minutes, difficulty, genre_tags, theme_tags, cover_url, budget, location, warnings" as const

const PLAYER_SCRIPT_DETAIL_COLUMNS = "id, title, description, author, player_count_min, player_count_max, duration_minutes, difficulty, genre_tags, theme_tags, cover_url, budget, location, warnings, is_social_script" as const

const SCRIPT_PROTECTED_CONTENT_COLUMNS = "script_id, core_content_html, roles, pdf_storage_path, page_image_paths, page_count" as const

const SIGNED_URL_TTL_SECONDS = 5 * 60

export interface AuthorizedScriptContent {
  canViewFull: boolean
  coreContentHtml: string | null
  roles: Json | null
  pdfUrl: string | null
  pageImageUrls: string[]
  pageCount: number
}

const EMPTY_PROTECTED_CONTENT: AuthorizedScriptContent = {
  canViewFull: false,
  coreContentHtml: null,
  roles: null,
  pdfUrl: null,
  pageImageUrls: [],
  pageCount: 0,
}

export async function fetchPublishedScripts(search?: string, genre?: string) {
  const supabase = await createClient()

  let query = supabase
    .from("scripts")
    .select(PUBLIC_SCRIPT_LIST_COLUMNS)
    .eq("is_published", true)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })

  if (search) {
    const safe = sanitizePostgrestValue(search)
    if (safe) query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`)
  }
  if (genre) query = query.contains("genre_tags", [genre])

  const { data, error } = await query.limit(100)
  if (error) throw error
  return data ?? []
}

export async function fetchLandingScripts(limit = 6) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .select("id, title, cover_url, genre_tags, player_count_min, player_count_max, budget, location")
    .eq("is_published", true)
    .eq("is_featured", true)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(limit)

  if (error) return []
  return data ?? []
}

/** Public metadata only. Protected script content must never be selected here. */
export async function fetchPublicScript(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .select(PUBLIC_SCRIPT_DETAIL_COLUMNS)
    .eq("id", id)
    .eq("is_published", true)
    .is("archived_at", null)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Player metadata only. Module switches are enforced by the route. */
export async function fetchPlayerScriptMetadata(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("scripts")
    .select(PLAYER_SCRIPT_DETAIL_COLUMNS)
    .eq("id", id)
    .eq("is_player_visible", true)
    .is("archived_at", null)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function checkScriptAccess(scriptId: string, memberId: string) {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const [memberResult, accessResult] = await Promise.all([
    supabase
      .from("members")
      .select("id")
      .eq("id", memberId)
      .eq("record_scope", "current")
      .eq("status", "approved")
      .eq("account_status", "active")
      .eq("membership_type", "player")
      .maybeSingle(),
    supabase
      .from("script_play_records")
      .select("id")
      .eq("script_id", scriptId)
      .eq("member_id", memberId)
      .eq("can_view_full", true)
      .lte("granted_at", now)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle(),
  ])

  if (memberResult.error || accessResult.error) return false
  return Boolean(memberResult.data && accessResult.data)
}

/**
 * Reads protected content through the signed-in user's RLS policy, then uses the
 * service client only to mint short-lived URLs for the already-authorized paths.
 */
export async function fetchAuthorizedScriptContent(
  scriptId: string,
  memberId: string,
): Promise<AuthorizedScriptContent> {
  if (!await checkScriptAccess(scriptId, memberId)) return EMPTY_PROTECTED_CONTENT

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("script_protected_content")
    .select(SCRIPT_PROTECTED_CONTENT_COLUMNS)
    .eq("script_id", scriptId)
    .maybeSingle()

  if (error || !data) return EMPTY_PROTECTED_CONTENT

  const admin = createAdminClient()
  const pdfPath = safeProtectedPath(data.pdf_storage_path, `pdfs/${scriptId}/`)
  const pagePaths = (data.page_image_paths ?? [])
    .map((path) => safeProtectedPath(path, `pages/${scriptId}/`))
    .filter((path): path is string => path !== null)

  const [pdfUrl, pageImageUrls] = await Promise.all([
    pdfPath ? createShortSignedUrl(admin, pdfPath) : Promise.resolve(null),
    Promise.all(pagePaths.map((path) => createShortSignedUrl(admin, path)))
      .then((urls) => urls.filter((url): url is string => url !== null)),
  ])

  return {
    canViewFull: true,
    coreContentHtml: data.core_content_html,
    roles: data.roles,
    pdfUrl,
    pageImageUrls,
    pageCount: data.page_count,
  }
}

function safeProtectedPath(value: string | null, expectedPrefix: string): string | null {
  if (!value || value.startsWith("/") || value.includes("\\")) return null
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.split("/").includes("..")) return null
  } catch {
    return null
  }
  return value.startsWith(expectedPrefix) ? value : null
}

async function createShortSignedUrl(admin: ReturnType<typeof createAdminClient>, path: string) {
  const { data, error } = await admin.storage
    .from("scripts")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  return error ? null : data.signedUrl
}
