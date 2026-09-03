"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { contentMediaCleanupOutboxIsReady } from "@/lib/content-media-cleanup"
import type { LegacyScriptCoverCandidate } from "@/lib/legacy-script-cover"
import { fetchLegacyScriptCoverCandidates } from "@/lib/legacy-script-cover-query"
import { materializeLegacyScriptCover } from "@/lib/legacy-script-cover-storage"
import { normalizeAdminAuditReason } from "@/lib/member-master/audit-reason"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const MAX_APPROVED_CANDIDATES = 27
const BATCH_SIZE = 5

export async function migrateLegacyScriptCoverBatch(rawReason: string) {
  await requireAdmin()
  const reason = normalizeAdminAuditReason(rawReason)
  if (!reason.ok) return { error: reason.error }
  if (await contentMediaCleanupOutboxIsReady()) {
    return { error: "内容管理 V2 Contract 已完成，不再需要旧封面迁移" }
  }

  let candidates: LegacyScriptCoverCandidate[]
  try {
    candidates = await fetchLegacyScriptCoverCandidates()
  } catch (error) {
    console.error("[migrateLegacyScriptCoverBatch:query]", error)
    return { error: "无法读取旧封面清单，未进行迁移" }
  }
  if (candidates.length > MAX_APPROVED_CANDIDATES) {
    return { error: `检测到 ${candidates.length} 个旧封面，超过已确认的 27 个，已停止迁移` }
  }
  if (candidates.length === 0) {
    return { success: true, migrated: 0, compressed: 0, reused: 0, remaining: 0 }
  }

  let migrated = 0
  let compressed = 0
  let reused = 0
  for (const candidate of candidates.slice(0, BATCH_SIZE)) {
    try {
      const materialized = await materializeLegacyScriptCover(candidate)
      await updateCoverReference(candidate, materialized.publicUrl, reason.reason)
      migrated += 1
      if (materialized.compressed) compressed += 1
      if (materialized.reused) reused += 1
    } catch (error) {
      console.error(`[migrateLegacyScriptCoverBatch:${candidate.id}]`, error)
      return {
        error: `迁移“${candidate.title}”时失败，已停止；本批已完成 ${migrated} 个`,
        migrated,
        compressed,
        reused,
        remaining: candidates.length - migrated,
      }
    }
  }

  revalidatePath("/admin/scripts")
  revalidatePath("/scripts")
  revalidatePath("/app/scripts")
  const remaining = (await fetchLegacyScriptCoverCandidates()).length
  return { success: true, migrated, compressed, reused, remaining }
}

async function updateCoverReference(
  candidate: LegacyScriptCoverCandidate,
  publicUrl: string,
  reason: string,
) {
  const db = await createClient()
  let update = db
    .from("scripts")
    .update({ cover_url: publicUrl, audit_reason: reason })
    .eq("id", candidate.id)
    .eq("updated_at", candidate.updatedAt)
  update = candidate.expectedCoverUrl === null
    ? update.is("cover_url", null)
    : update.eq("cover_url", candidate.expectedCoverUrl)
  const { data, error } = await update.select("id").maybeSingle()
  if (!error && data) return

  const { data: current, error: confirmError } = await createAdminClient()
    .from("scripts")
    .select("cover_url")
    .eq("id", candidate.id)
    .maybeSingle()
  if (!confirmError && current?.cover_url === publicUrl) return
  throw new Error(error?.message ?? "LEGACY_SCRIPT_COVER_REFERENCE_UPDATE_FAILED")
}
