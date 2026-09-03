import { createAdminClient } from "@/lib/supabase/admin"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

export type ContentMediaCleanupKind = "script" | "past_event_review"

export interface ContentMediaCleanupJob {
  id: string
  content_kind: ContentMediaCleanupKind
  content_id: string
  bucket_id: "scripts" | "scripts-covers" | "activity-media"
  object_paths: string[]
  reason: string
  created_at: string
  last_attempted_at: string | null
  last_error: string | null
}

interface QueueContentMediaCleanupInput {
  contentKind: ContentMediaCleanupKind
  contentId: string
  bucketId: ContentMediaCleanupJob["bucket_id"]
  objectPaths: string[]
  reason: string
  createdBy: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Contract preflight: hard deletion is disabled until the durable outbox exists. */
export async function contentMediaCleanupOutboxIsReady() {
  const { error } = await createContentMediaAdminClient()
    .from("content_media_cleanup_jobs")
    .select("id")
    .limit(1)
  return !error
}

export async function fetchPendingContentMediaCleanupJobs(kind: ContentMediaCleanupKind) {
  const { data, error } = await createContentMediaAdminClient()
    .from("content_media_cleanup_jobs")
    .select("id, content_kind, content_id, bucket_id, object_paths, reason, created_at, last_attempted_at, last_error")
    .eq("content_kind", kind)
    .order("created_at", { ascending: true })
    .limit(100)

  // The compatible app is deployed between Expand and Contract. During that
  // short phase the outbox does not exist and the recycle-bin banner stays hidden.
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || error.message.includes("content_media_cleanup_jobs")) return []
    throw error
  }
  return (data ?? []).flatMap((row) => isCleanupJob(row) ? [row] : [])
}

/**
 * Remove managed objects and persist a durable retry job if Storage is
 * temporarily unavailable. The service-role client is intentionally kept in
 * this server-only module; callers must authenticate the administrator first.
 */
export async function removeStorageObjectsOrQueue(input: QueueContentMediaCleanupInput) {
  const objectPaths = [...new Set(input.objectPaths)]
  if (objectPaths.length === 0) return { success: true as const, queued: false }
  if (!cleanupManifestIsValid(input.contentKind, input.contentId, input.bucketId, objectPaths)) {
    return { success: false as const, queued: false, error: "文件清理清单无效" }
  }

  // Persist the deletion claim before checking references or calling Storage.
  // Contract-side write guards reject any newly introduced reference while
  // this job exists, closing the cross-request check-then-delete race.
  const queued = await queueContentMediaCleanupJob({ ...input, objectPaths })
  if (!queued.success) {
    return {
      success: false as const,
      queued: false,
      error: "托管文件删除保护未能保存，已停止文件清理",
    }
  }

  const result = await runContentMediaCleanupJob(queued.jobId)
  return result.error
    ? { success: false as const, queued: true, error: result.error }
    : { success: true as const, queued: false }
}

async function queueContentMediaCleanupJob(
  input: QueueContentMediaCleanupInput,
  admin = createContentMediaAdminClient(),
) {
  const objectPaths = [...new Set(input.objectPaths)]
  const reason = input.reason.trim()
  if (
    !UUID_PATTERN.test(input.createdBy)
    || reason.length < 4
    || reason.length > 500
    || !cleanupManifestIsValid(input.contentKind, input.contentId, input.bucketId, objectPaths)
  ) {
    return { success: false as const }
  }

  // The outbox is append-only: every failed Storage operation receives its
  // own job id. This keeps concurrent failures independent and prevents a
  // runner from acknowledging paths appended after it read a job.
  const { data, error: insertError } = await admin
    .from("content_media_cleanup_jobs")
    .insert({
      content_kind: input.contentKind,
      content_id: input.contentId,
      bucket_id: input.bucketId,
      object_paths: objectPaths,
      reason,
      created_by: input.createdBy,
    })
    .select("id")
    .single()
  if (!insertError && typeof data?.id === "string" && UUID_PATTERN.test(data.id)) {
    return { success: true as const, jobId: data.id }
  }
  if (insertError && !cleanupTableIsUnavailable(insertError)) {
    console.error("[queueContentMediaCleanupJob:insert]", insertError)
  } else if (!insertError) {
    console.error("[queueContentMediaCleanupJob:insert] Invalid inserted job id")
  }
  return { success: false as const }
}

export async function runContentMediaCleanupJob(jobId: string) {
  if (!UUID_PATTERN.test(jobId)) return { error: "清理任务编号无效" }
  const admin = createContentMediaAdminClient()
  const { data, error } = await admin
    .from("content_media_cleanup_jobs")
    .select("id, content_kind, content_id, bucket_id, object_paths, reason, created_at, last_attempted_at, last_error")
    .eq("id", jobId)
    .maybeSingle()
  if (error) return { error: "读取文件清理任务失败" }
  if (!data) return { success: true }
  if (!isCleanupJob(data) || !cleanupJobPathsAreValid(data)) {
    await recordCleanupFailure(jobId, "Cleanup manifest validation failed")
    return { error: "文件清理任务清单无效，已停止操作" }
  }

  const referenceResult = await findReferencedCleanupPaths(data)
  if (referenceResult.error) {
    await recordCleanupFailure(jobId, "Content references could not be verified")
    return { error: "清理前无法确认文件引用状态" }
  }

  const referenced = data.object_paths.filter((path) => referenceResult.paths.has(path))
  let remaining = data.object_paths.filter((path) => !referenceResult.paths.has(path))
  while (remaining.length > 0) {
    const batch = remaining.slice(0, 100)
    const { error: storageError } = await admin.storage
      .from(data.bucket_id)
      .remove(batch)
    if (storageError) {
      await recordCleanupFailure(jobId, "Storage remove failed", [...referenced, ...remaining])
      return { error: "托管文件仍未清理成功，请稍后重试" }
    }
    const completionError = await completeCleanupClaims(data, batch)
    if (completionError) {
      await recordCleanupFailure(
        jobId,
        "Storage removed but deletion claim completion failed",
        [...referenced, ...remaining],
      )
      return { error: "文件已清理，但删除凭证确认失败；任务已保留，可安全重试" }
    }
    remaining = remaining.slice(batch.length)
  }

  if (referenced.length > 0) {
    await recordCleanupFailure(jobId, "One or more objects are still referenced", referenced)
    return { error: "部分文件仍被内容引用，已保留任务并拒绝删除这些文件" }
  }

  const { error: deleteError } = await admin
    .from("content_media_cleanup_jobs")
    .delete()
    .eq("id", jobId)
  if (deleteError) {
    await recordCleanupFailure(jobId, "Storage removed but outbox acknowledgement failed")
    return { error: "文件已清理，但任务确认失败；可安全再次重试" }
  }
  return { success: true }
}

export async function runContentMediaCleanupJobsForContent(
  kind: ContentMediaCleanupKind,
  contentId: string,
) {
  if (!UUID_PATTERN.test(contentId)) return { error: "内容编号无效", pending: 0 }
  const { data, error } = await createContentMediaAdminClient()
    .from("content_media_cleanup_jobs")
    .select("id, content_kind, content_id, bucket_id, object_paths, reason, created_at, last_attempted_at, last_error")
    .eq("content_kind", kind)
    .eq("content_id", contentId)
  if (error) return { error: "读取文件清理任务失败", pending: 1 }
  const matching = (data ?? []).flatMap((row) => isCleanupJob(row) ? [row] : [])
  if (matching.length !== (data?.length ?? 0)) {
    return { error: "文件清理清单无效", pending: 1 }
  }
  const errors: string[] = []
  for (const job of matching) {
    const result = await runContentMediaCleanupJob(job.id)
    if (result.error) errors.push(result.error)
  }
  return errors.length > 0
    ? { error: errors[0], pending: errors.length }
    : { success: true, pending: 0 }
}

async function recordCleanupFailure(jobId: string, message: string, remainingPaths?: string[]) {
  const { error } = await createContentMediaAdminClient()
    .from("content_media_cleanup_jobs")
    .update({
      last_attempted_at: new Date().toISOString(),
      last_error: message.slice(0, 500),
      ...(remainingPaths ? { object_paths: remainingPaths } : {}),
    })
    .eq("id", jobId)
  if (error) console.error("[recordCleanupFailure]", error)
}

function isCleanupJob(value: unknown): value is ContentMediaCleanupJob {
  if (!value || typeof value !== "object") return false
  const row = value as Partial<ContentMediaCleanupJob>
  return typeof row.id === "string"
    && UUID_PATTERN.test(row.id)
    && (row.content_kind === "script" || row.content_kind === "past_event_review")
    && typeof row.content_id === "string"
    && UUID_PATTERN.test(row.content_id)
    && (row.bucket_id === "scripts" || row.bucket_id === "scripts-covers" || row.bucket_id === "activity-media")
    && Array.isArray(row.object_paths)
    && row.object_paths.every((path) => typeof path === "string")
    && typeof row.reason === "string"
    && typeof row.created_at === "string"
}

function cleanupJobPathsAreValid(job: ContentMediaCleanupJob) {
  return cleanupManifestIsValid(job.content_kind, job.content_id, job.bucket_id, job.object_paths)
}

function cleanupManifestIsValid(
  contentKind: ContentMediaCleanupKind,
  contentId: string,
  bucketId: ContentMediaCleanupJob["bucket_id"],
  objectPaths: string[],
) {
  if (!UUID_PATTERN.test(contentId) || objectPaths.length === 0) return false
  const expectedPrefixes = contentKind === "script"
    ? bucketId === "scripts"
      ? [`pages/${contentId}/`, `pdfs/${contentId}/`]
      : bucketId === "scripts-covers"
        ? [`covers/${contentId}/`]
        : []
    : bucketId === "activity-media"
      ? [`activities/${contentId}/`]
      : []

  return expectedPrefixes.length > 0
    && new Set(objectPaths).size === objectPaths.length
    && objectPaths.every((path) => (
      expectedPrefixes.some((prefix) => path.startsWith(prefix))
      && !path.includes("..")
      && !path.includes("\\")
      && !path.includes("?")
      && !path.includes("#")
      && !path.startsWith("/")
      && path.length <= 500
    ))
}

async function findReferencedCleanupPaths(
  job: Pick<ContentMediaCleanupJob, "id" | "content_kind" | "content_id" | "bucket_id" | "object_paths">,
) {
  const paths = new Set<string>()
  const { data, error } = await createContentMediaAdminClient().rpc(
    "content_media_cleanup_referenced_paths_v2",
    {
      p_job_id: job.id,
      p_bucket_id: job.bucket_id,
      p_object_paths: job.object_paths,
    },
  )
  if (error) return { paths, error }
  if (!Array.isArray(data) || data.some((path) => typeof path !== "string")) {
    return { paths, error: new Error("Invalid cleanup reference response") }
  }
  for (const path of data) paths.add(path)
  return { paths, error: null }
}

async function completeCleanupClaims(
  job: Pick<ContentMediaCleanupJob, "id" | "bucket_id">,
  objectPaths: string[],
) {
  const { error } = await createContentMediaAdminClient().rpc(
    "content_media_cleanup_complete_claims_v2",
    {
      p_job_id: job.id,
      p_bucket_id: job.bucket_id,
      p_object_paths: objectPaths,
    },
  )
  return error
}

function cleanupTableIsUnavailable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205"
    || error.code === "42P01"
    || Boolean(error.message?.includes("content_media_cleanup_jobs"))
}

function createContentMediaAdminClient() {
  return createAdminClient() as SupabaseClient<Database>
}
