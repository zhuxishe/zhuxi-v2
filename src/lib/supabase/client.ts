import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/database.types"

export function createClient() {
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseKey) throw new Error("Missing Supabase public key")

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey
  )
}
