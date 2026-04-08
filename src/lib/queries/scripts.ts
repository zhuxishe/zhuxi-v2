import { createClient } from "@/lib/supabase/server"

export async function fetchPublishedScripts(search?: string, genre?: string) {
  const supabase = await createClient()

  let query = supabase
    .from("scripts")
    .select("id, title, cover_url, genre_tags, player_count_min, player_count_max, budget, location, author, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  if (search) {
    query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`)
  }
  if (genre) {
    query = query.contains("genre_tags", [genre])
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchLandingScripts(limit = 6) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .select("id, title, cover_url, genre_tags, player_count_min, player_count_max, budget, location")
    .eq("is_published", true)
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

export async function fetchAdminScripts() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}
