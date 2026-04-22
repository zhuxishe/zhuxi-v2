import { createClient } from "@/lib/supabase/server"
import { sanitizePostgrestValue } from "@/lib/sanitize"

export async function fetchPublishedScripts(search?: string, genre?: string) {
  const supabase = await createClient()

  let query = supabase
    .from("scripts")
    .select("id, title, cover_url, genre_tags, player_count_min, player_count_max, budget, location, author, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  if (search) {
    const safe = sanitizePostgrestValue(search)
    query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`)
  }
  if (genre) {
    query = query.contains("genre_tags", [genre])
  }

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
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return []
  return data ?? []
}

export async function fetchScript(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw error
  return data
}

export async function checkScriptAccess(scriptId: string, memberId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from("script_play_records")
    .select("can_view_full")
    .eq("script_id", scriptId)
    .eq("member_id", memberId)
    .maybeSingle()

  return data?.can_view_full ?? false
}

const SCRIPT_PAGE_SIZE = 24

export async function fetchAdminScripts(options?: { page?: number }) {
  const supabase = await createClient()

  const page = options?.page ?? 1
  const from = (page - 1) * SCRIPT_PAGE_SIZE
  const to = from + SCRIPT_PAGE_SIZE - 1

  const { data, error, count } = await supabase
    .from("scripts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) throw error
  return { scripts: data ?? [], total: count ?? 0 }
}
