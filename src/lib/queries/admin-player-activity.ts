import { createClient } from "@/lib/supabase/server"

export interface PlayerActivitySettings {
  id: number
  large_activities_enabled: boolean
  social_scripts_enabled: boolean
  script_library_enabled: boolean
  large_home_limit: number
  social_home_limit: number
  updated_at: string
  updated_by: string | null
}

export interface PlayerActivitySettingsAdminState {
  settings: PlayerActivitySettings | null
  setupRequired: boolean
}

function isMissingActivitySettings(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.message?.includes("player_activity_settings")
}

export async function fetchPlayerActivitySettingsAdminState(): Promise<PlayerActivitySettingsAdminState> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("player_activity_settings")
    .select("id, large_activities_enabled, social_scripts_enabled, script_library_enabled, large_home_limit, social_home_limit, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle()

  if (error && isMissingActivitySettings(error)) {
    return { settings: null, setupRequired: true }
  }
  if (error) throw error
  return { settings: data, setupRequired: false }
}
