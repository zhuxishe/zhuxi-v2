import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface StaffProfile {
  id: string
  name: string
  school: string
  major: string
  intro: string
  avatar_url: string | null
  is_published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type StaffProfilePublic = Pick<
  StaffProfile,
  "id" | "name" | "school" | "major" | "intro" | "avatar_url"
>

export interface StaffAdminState {
  staff: StaffProfile[]
  setupRequired: boolean
}

function isMissingStaffTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.message?.includes("staff_profiles")
}

export async function fetchPublishedStaffProfiles(): Promise<StaffProfilePublic[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, name, school, major, intro, avatar_url")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) return []
  return (data ?? []) as StaffProfilePublic[]
}

export async function fetchAllStaffProfiles(): Promise<StaffProfile[]> {
  const result = await fetchStaffAdminState()
  return result.staff
}

export async function fetchStaffAdminState(): Promise<StaffAdminState> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error && isMissingStaffTable(error)) {
    return { staff: [], setupRequired: true }
  }
  if (error) throw error
  return { staff: (data ?? []) as StaffProfile[], setupRequired: false }
}
