import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  removeStorageObjectsOrQueue,
  runContentMediaCleanupJob,
  type ContentMediaCleanupJob,
} from "./content-media-cleanup"

const createAdminClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }))

const JOB_ID = "11111111-1111-4111-8111-111111111111"
const SCRIPT_ID = "22222222-2222-4222-8222-222222222222"
const OTHER_SCRIPT_ID = "33333333-3333-4333-8333-333333333333"
const ADMIN_ID = "44444444-4444-4444-8444-444444444444"

type MockResponse = {
  data: unknown
  error: { code?: string; message: string } | null
}

function queryResult(response: MockResponse = { data: null, error: null }) {
  const promise = Promise.resolve(response)
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: promise.then.bind(promise),
  }
  for (const method of [
    query.select,
    query.eq,
    query.order,
    query.limit,
    query.insert,
    query.update,
    query.delete,
  ]) {
    method.mockReturnValue(query)
  }
  return query
}

function adminHarness(
  tableQueries: Record<string, ReturnType<typeof queryResult>[]>,
  removeResponses: Array<{ error: { message: string } | null }> = [{ error: null }],
  rpcResponses: MockResponse[] = [{ data: [], error: null }],
) {
  const queues = new Map(
    Object.entries(tableQueries).map(([table, queries]) => [table, [...queries]]),
  )
  const remove = vi.fn()
  for (const response of removeResponses) remove.mockResolvedValueOnce(response)
  remove.mockResolvedValue({ error: null })
  const storageFrom = vi.fn().mockReturnValue({ remove })
  const rpc = vi.fn()
  for (const response of rpcResponses) rpc.mockResolvedValueOnce(response)
  rpc.mockResolvedValue({ data: [], error: null })
  const from = vi.fn((table: string) => {
    const query = queues.get(table)?.shift()
    if (!query) throw new Error(`Unexpected query for ${table}`)
    return query
  })
  return {
    admin: { from, rpc, storage: { from: storageFrom } },
    from,
    rpc,
    storageFrom,
    remove,
  }
}

function cleanupInput(objectPaths: string[]) {
  return {
    contentKind: "script" as const,
    contentId: SCRIPT_ID,
    bucketId: "scripts" as const,
    objectPaths,
    reason: "Remove superseded script files",
    createdBy: ADMIN_ID,
  }
}

function cleanupJob(objectPaths: string[], id = JOB_ID): ContentMediaCleanupJob {
  return {
    id,
    content_kind: "script",
    content_id: SCRIPT_ID,
    bucket_id: "scripts",
    object_paths: objectPaths,
    reason: "Remove superseded script files",
    created_at: "2026-09-03T00:00:00.000Z",
    last_attempted_at: null,
    last_error: null,
  }
}

describe("content media cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it("rejects an invalid object manifest before touching Storage", async () => {
    const result = await removeStorageObjectsOrQueue(cleanupInput([
      `pdfs/${OTHER_SCRIPT_ID}/original.pdf`,
    ]))

    expect(result).toEqual({
      success: false,
      queued: false,
      error: "文件清理清单无效",
    })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("persists a deletion claim before removing valid objects", async () => {
    const path = `pdfs/${SCRIPT_ID}/original.pdf`
    const claimInsert = queryResult({ data: { id: JOB_ID }, error: null })
    const jobRead = queryResult({ data: cleanupJob([path]), error: null })
    const acknowledgement = queryResult()
    const harness = adminHarness({
      content_media_cleanup_jobs: [claimInsert, jobRead, acknowledgement],
    })
    createAdminClient.mockReturnValue(harness.admin)

    const result = await removeStorageObjectsOrQueue(cleanupInput([path, path]))

    expect(result).toEqual({ success: true, queued: false })
    expect(harness.storageFrom).toHaveBeenCalledWith("scripts")
    expect(harness.remove).toHaveBeenCalledWith([path])
    expect(harness.rpc).toHaveBeenCalledWith("content_media_cleanup_referenced_paths_v2", {
      p_job_id: JOB_ID,
      p_bucket_id: "scripts",
      p_object_paths: [path],
    })
    expect(harness.rpc).toHaveBeenCalledWith("content_media_cleanup_complete_claims_v2", {
      p_job_id: JOB_ID,
      p_bucket_id: "scripts",
      p_object_paths: [path],
    })
    expect(claimInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      object_paths: [path],
    }))
    expect(claimInsert.insert.mock.invocationCallOrder[0])
      .toBeLessThan(harness.remove.mock.invocationCallOrder[0])
    expect(acknowledgement.delete).toHaveBeenCalledOnce()
  })

  it("appends an independent durable job for every failed Storage operation", async () => {
    const path = `pdfs/${SCRIPT_ID}/original.pdf`
    const secondJobId = "55555555-5555-4555-8555-555555555555"
    const firstInsert = queryResult({ data: { id: JOB_ID }, error: null })
    const firstRead = queryResult({ data: cleanupJob([path]), error: null })
    const firstFailure = queryResult()
    const secondInsert = queryResult({ data: { id: secondJobId }, error: null })
    const secondRead = queryResult({ data: cleanupJob([path], secondJobId), error: null })
    const secondFailure = queryResult()
    const harness = adminHarness(
      {
        content_media_cleanup_jobs: [
          firstInsert,
          firstRead,
          firstFailure,
          secondInsert,
          secondRead,
          secondFailure,
        ],
      },
      [
        { error: { message: "storage unavailable" } },
        { error: { message: "storage unavailable" } },
      ],
    )
    createAdminClient.mockReturnValue(harness.admin)

    const first = await removeStorageObjectsOrQueue(cleanupInput([path]))
    const second = await removeStorageObjectsOrQueue(cleanupInput([path]))

    expect(first).toMatchObject({ success: false, queued: true })
    expect(second).toMatchObject({ success: false, queued: true })
    for (const insert of [firstInsert, secondInsert]) {
      expect(insert.insert).toHaveBeenCalledOnce()
      expect(insert.insert).toHaveBeenCalledWith({
        content_kind: "script",
        content_id: SCRIPT_ID,
        bucket_id: "scripts",
        object_paths: [path],
        reason: "Remove superseded script files",
        created_by: ADMIN_ID,
      })
      expect(insert.update).not.toHaveBeenCalled()
    }
  })

  it("queues a still-referenced path for collection after its final reference is removed", async () => {
    const path = `pdfs/${SCRIPT_ID}/shared.pdf`
    const insert = queryResult({ data: { id: JOB_ID }, error: null })
    const jobRead = queryResult({ data: cleanupJob([path]), error: null })
    const failureUpdate = queryResult()
    const harness = adminHarness(
      { content_media_cleanup_jobs: [insert, jobRead, failureUpdate] },
      [{ error: null }],
      [{ data: [path], error: null }],
    )
    createAdminClient.mockReturnValue(harness.admin)

    const result = await removeStorageObjectsOrQueue(cleanupInput([path]))

    expect(result).toMatchObject({ success: false, queued: true })
    expect(result.error).toContain("仍被内容引用")
    expect(harness.storageFrom).not.toHaveBeenCalled()
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ object_paths: [path] }))
  })

  it("keeps a job and never removes an object that the content still references", async () => {
    const referencedPath = `pdfs/${SCRIPT_ID}/original.pdf`
    const jobRead = queryResult({ data: cleanupJob([referencedPath]), error: null })
    const failureUpdate = queryResult()
    const harness = adminHarness(
      { content_media_cleanup_jobs: [jobRead, failureUpdate] },
      [{ error: null }],
      [{ data: [referencedPath], error: null }],
    )
    createAdminClient.mockReturnValue(harness.admin)

    const result = await runContentMediaCleanupJob(JOB_ID)

    expect(result).toEqual({ error: "部分文件仍被内容引用，已保留任务并拒绝删除这些文件" })
    expect(harness.storageFrom).not.toHaveBeenCalled()
    expect(failureUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      last_error: "One or more objects are still referenced",
      object_paths: [referencedPath],
    }))
    expect(failureUpdate.delete).not.toHaveBeenCalled()
  })

  it.each([
    "content no longer exists",
    "content points at a replacement",
  ])("removes stale Storage objects and acknowledges the job when %s", async () => {
    const stalePath = `pdfs/${SCRIPT_ID}/original.pdf`
    const jobRead = queryResult({ data: cleanupJob([stalePath]), error: null })
    const acknowledgement = queryResult()
    const harness = adminHarness({
      content_media_cleanup_jobs: [jobRead, acknowledgement],
    })
    createAdminClient.mockReturnValue(harness.admin)

    const result = await runContentMediaCleanupJob(JOB_ID)

    expect(result).toEqual({ success: true })
    expect(harness.storageFrom).toHaveBeenCalledWith("scripts")
    expect(harness.remove).toHaveBeenCalledWith([stalePath])
    expect(harness.rpc).toHaveBeenCalledWith("content_media_cleanup_complete_claims_v2", {
      p_job_id: JOB_ID,
      p_bucket_id: "scripts",
      p_object_paths: [stalePath],
    })
    expect(acknowledgement.delete).toHaveBeenCalledOnce()
    expect(acknowledgement.eq).toHaveBeenCalledWith("id", JOB_ID)
    expect(acknowledgement.update).not.toHaveBeenCalled()
  })

  it("removes only unreferenced paths and rewrites the job to the referenced remainder", async () => {
    const referencedPath = `pages/${SCRIPT_ID}/page-001.webp`
    const stalePath = `pages/${SCRIPT_ID}/page-002.webp`
    const jobRead = queryResult({ data: cleanupJob([referencedPath, stalePath]), error: null })
    const failureUpdate = queryResult()
    const harness = adminHarness(
      { content_media_cleanup_jobs: [jobRead, failureUpdate] },
      [{ error: null }],
      [{ data: [referencedPath], error: null }],
    )
    createAdminClient.mockReturnValue(harness.admin)

    const result = await runContentMediaCleanupJob(JOB_ID)

    expect(result).toEqual({ error: "部分文件仍被内容引用，已保留任务并拒绝删除这些文件" })
    expect(harness.remove).toHaveBeenCalledOnce()
    expect(harness.remove).toHaveBeenCalledWith([stalePath])
    expect(harness.rpc).toHaveBeenCalledWith("content_media_cleanup_complete_claims_v2", {
      p_job_id: JOB_ID,
      p_bucket_id: "scripts",
      p_object_paths: [stalePath],
    })
    expect(failureUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      last_error: "One or more objects are still referenced",
      object_paths: [referencedPath],
    }))
    expect(failureUpdate.delete).not.toHaveBeenCalled()
  })

  it("retains the durable job when Storage succeeds but claim completion fails", async () => {
    const stalePath = `pdfs/${SCRIPT_ID}/original.pdf`
    const jobRead = queryResult({ data: cleanupJob([stalePath]), error: null })
    const failureUpdate = queryResult()
    const harness = adminHarness(
      { content_media_cleanup_jobs: [jobRead, failureUpdate] },
      [{ error: null }],
      [
        { data: [], error: null },
        { data: null, error: { message: "claim completion unavailable" } },
      ],
    )
    createAdminClient.mockReturnValue(harness.admin)

    const result = await runContentMediaCleanupJob(JOB_ID)

    expect(result).toEqual({ error: "文件已清理，但删除凭证确认失败；任务已保留，可安全重试" })
    expect(harness.remove).toHaveBeenCalledWith([stalePath])
    expect(failureUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      last_error: "Storage removed but deletion claim completion failed",
      object_paths: [stalePath],
    }))
    expect(failureUpdate.delete).not.toHaveBeenCalled()
  })
})
