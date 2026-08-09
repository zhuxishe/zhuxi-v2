import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 60

const MEDIA_CLEANUP_BATCH_SIZE = 25

interface CleanupRow {
  cleanup_id: number
  bucket_id: string
  object_path: string
  cleanup_claim_token: string
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (!secret || !authorization?.startsWith("Bearer ")) return false
  const provided = authorization.slice("Bearer ".length)
  const expectedBytes = Buffer.from(secret)
  const providedBytes = Buffer.from(provided)
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes)
}

/**
 * Daily V1 maintenance: send scheduled announcements, enforce retention, and
 * remove queued private media objects. Vercel invokes this route with the
 * CRON_SECRET bearer token; it is never available to member sessions.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Community maintenance is not configured" }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = createAdminClient()
  const announcementResult = await db.rpc("community_dispatch_scheduled_announcements")
  if (announcementResult.error) throw new Error(announcementResult.error.message)

  const purgeResult = await db.rpc("community_purge_expired_data")
  if (purgeResult.error) throw new Error(purgeResult.error.message)

  const cleanupResult = await db.rpc("community_admin_claim_media_cleanup", {
    p_limit: MEDIA_CLEANUP_BATCH_SIZE,
  })
  if (cleanupResult.error) throw new Error(cleanupResult.error.message)

  let mediaRemoved = 0
  let mediaFailed = 0
  for (const item of (cleanupResult.data ?? []) as CleanupRow[]) {
    const { error: storageError } = await db.storage.from(item.bucket_id).remove([item.object_path])
    const errorMessage = storageError?.message ?? null
    const { error: completionError } = await db.rpc("community_admin_complete_media_cleanup", {
      p_cleanup_id: item.cleanup_id,
      p_claim_token: item.cleanup_claim_token,
      p_error: errorMessage,
    })
    if (completionError) throw new Error(completionError.message)
    if (storageError) mediaFailed += 1
    else mediaRemoved += 1
  }

  return NextResponse.json({
    announcementsSent: announcementResult.data ?? 0,
    retention: purgeResult.data ?? {},
    mediaRemoved,
    mediaFailed,
  })
}
