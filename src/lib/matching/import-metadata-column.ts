import type { SupabaseClient } from "@supabase/supabase-js"
import { getPostgrestErrorMessage, isMissingColumnError } from "@/lib/supabase/postgrest-error"

export function buildRoundSubmissionSelect(includeImportMetadata: boolean) {
  return includeImportMetadata
    ? "member_id, game_type_pref, gender_pref, message, import_metadata"
    : "member_id, game_type_pref, gender_pref, message"
}

export async function supportsImportMetadataColumn(
  db: SupabaseClient<any, any, any>,
): Promise<boolean> {
  const probe = await (db as any)
    .from("match_round_submissions")
    .select("import_metadata")
    .limit(0)

  if (!probe.error) return true
  if (isMissingColumnError(probe.error, "import_metadata")) return false
  throw new Error(getPostgrestErrorMessage(probe.error, "无法检查导入元数据列"))
}
