import { contentMediaCleanupOutboxIsReady } from "@/lib/content-media-cleanup"
import {
  isPotentialLegacyScriptCoverUrl,
  LEGACY_COVER_RECONCILIATION_SCRIPT_ID,
  type LegacyScriptCoverCandidate,
  legacyProtectedPagePathIsValid,
  legacyScriptCoverSourcePath,
} from "@/lib/legacy-script-cover"
import { createAdminClient } from "@/lib/supabase/admin"

interface ScriptRow {
  id: string
  title: string
  cover_url: string | null
  updated_at: string
}

export async function fetchLegacyScriptCoverCandidates() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("scripts")
    .select("id, title, cover_url, updated_at")
    .order("id", { ascending: true })
  if (error) throw new Error("LEGACY_SCRIPT_COVER_QUERY_FAILED")

  const rows = (data ?? []) as ScriptRow[]
  const candidates = rows.flatMap((row) => candidateFromLegacyUrl(row))
  const missingCover = rows.find((row) => (
    row.id === LEGACY_COVER_RECONCILIATION_SCRIPT_ID && row.cover_url === null
  ))
  if (!missingCover) return candidates

  const { data: protectedContent, error: protectedError } = await admin
    .from("script_protected_content")
    .select("page_image_paths")
    .eq("script_id", missingCover.id)
    .maybeSingle()
  if (protectedError) throw new Error("LEGACY_SCRIPT_COVER_PROTECTED_QUERY_FAILED")
  const sourcePath = protectedContent?.page_image_paths?.[0]
  if (!sourcePath || !legacyProtectedPagePathIsValid(sourcePath, missingCover.id)) return candidates
  return [...candidates, toCandidate(missingCover, sourcePath)].sort((a, b) => a.id.localeCompare(b.id))
}

export async function fetchLegacyScriptCoverMigrationState() {
  if (await contentMediaCleanupOutboxIsReady()) return { count: 0, error: null }
  try {
    return { count: (await fetchLegacyScriptCoverCandidates()).length, error: null }
  } catch (error) {
    console.error("[fetchLegacyScriptCoverMigrationState]", error)
    return { count: 0, error: "无法检查旧封面状态，请稍后刷新" }
  }
}

function candidateFromLegacyUrl(row: ScriptRow): LegacyScriptCoverCandidate[] {
  if (!row.cover_url) return []
  const sourcePath = legacyScriptCoverSourcePath(row.cover_url, row.id)
  if (sourcePath) return [toCandidate(row, sourcePath)]
  if (isPotentialLegacyScriptCoverUrl(row.cover_url)) {
    throw new Error(`UNSAFE_LEGACY_SCRIPT_COVER:${row.id}`)
  }
  return []
}

function toCandidate(row: ScriptRow, sourcePath: string): LegacyScriptCoverCandidate {
  return {
    id: row.id,
    title: row.title,
    expectedCoverUrl: row.cover_url,
    sourcePath,
    updatedAt: row.updated_at,
  }
}
