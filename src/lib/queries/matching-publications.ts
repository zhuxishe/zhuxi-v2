import { createClient } from "@/lib/supabase/server"
import type { MatchingPublication } from "@/lib/matching/publication-display"

/** The RPC derives the member from the authenticated session and exposes no draft roster. */
export async function fetchMyMatchingPublications(): Promise<MatchingPublication[]> {
  const db = await createClient()
  const { data, error } = await db.rpc("get_my_matching_publications")
  if (error) throw new Error("Unable to load your matching publication status")
  if (!Array.isArray(data)) throw new Error("Invalid matching publication status")
  return data as unknown as MatchingPublication[]
}
