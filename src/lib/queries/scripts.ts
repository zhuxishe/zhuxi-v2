import { createClient } from "@/lib/supabase/server"

export async function fetchPublishedScripts(search?: string) {
  const supabase = await createClient()

  let query = supabase
    .from("scripts")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  if (search) {
    query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) throw error
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

export async function fetchAdminScripts() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("scripts")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}
