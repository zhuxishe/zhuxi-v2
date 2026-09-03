import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  removeStorageObjectsOrQueue: vi.fn(),
  runContentMediaCleanupJobsForContent: vi.fn(),
  contentMediaCleanupOutboxIsReady: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/content-media-cleanup", () => ({
  removeStorageObjectsOrQueue: mocks.removeStorageObjectsOrQueue,
  runContentMediaCleanupJobsForContent: mocks.runContentMediaCleanupJobsForContent,
  contentMediaCleanupOutboxIsReady: mocks.contentMediaCleanupOutboxIsReady,
}))

import { updatePageImages, deleteAllScriptFiles } from "./convert-actions"
import { updateScript } from "./edit/actions"
import { removeScriptCover } from "../new/upload-actions"

const SCRIPT_ID = "11111111-1111-4111-8111-111111111111"
const INITIAL_REVISION = "2026-09-03T00:00:00.000Z"
const NEXT_REVISION = "2026-09-03T00:01:00.000Z"
const OLD_PAGE = `pages/${SCRIPT_ID}/22222222-2222-4222-8222-222222222222/page_001.webp`
const NEW_PAGE = `pages/${SCRIPT_ID}/33333333-3333-4333-8333-333333333333/page_001.webp`

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.not.mockReturnValue(chain)
  chain.update.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  return chain
}

describe("script stale UI write guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      role: "super_admin",
    })
  })

  it("rejects a metadata form loaded before a newer script update", async () => {
    const scripts = query({ data: { id: SCRIPT_ID, updated_at: NEXT_REVISION }, error: null })
    const protectedContent = query({ data: { updated_at: INITIAL_REVISION }, error: null })
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => table === "scripts" ? scripts : protectedContent),
    })

    const result = await updateScript(
      SCRIPT_ID,
      { title: "旧页面标题", player_count_min: 4, player_count_max: 6, duration_minutes: 180 },
      "保存剧本基础资料更新",
      { scriptUpdatedAt: INITIAL_REVISION, protectedUpdatedAt: INITIAL_REVISION },
    )

    expect(result).toEqual({ error: "基本信息已被其他管理员修改，请刷新后重试" })
    expect(scripts.update).not.toHaveBeenCalled()
    expect(protectedContent.update).not.toHaveBeenCalled()
  })

  it("does not remove a cover that changed after the page was loaded", async () => {
    const scripts = query({
      data: { cover_url: "https://cdn.example.net/new.webp", updated_at: NEXT_REVISION },
      error: null,
    })
    mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(scripts) })

    const result = await removeScriptCover(
      SCRIPT_ID,
      "移除已经失效的旧封面",
      "https://cdn.example.net/old.webp",
    )

    expect(result).toEqual({ error: "封面已被其他管理员修改，请刷新后重试" })
    expect(scripts.update).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it("does not replace a newer page manifest with an older page order", async () => {
    const scripts = query({ data: { id: SCRIPT_ID }, error: null })
    const protectedContent = query({
      data: { page_image_paths: [NEW_PAGE], updated_at: NEXT_REVISION },
      error: null,
    })
    const from = vi.fn()
      .mockReturnValueOnce(scripts)
      .mockReturnValueOnce(protectedContent)
    mocks.createClient.mockResolvedValue({ from })

    const result = await updatePageImages(
      SCRIPT_ID,
      [OLD_PAGE],
      "调整剧本页面展示顺序",
      [OLD_PAGE],
    )

    expect(result).toEqual({ error: "页面清单已被其他管理员修改，请刷新后重试" })
    expect(protectedContent.update).not.toHaveBeenCalled()
  })

  it("does not delete files when either the PDF or pages differ from the UI snapshot", async () => {
    const scripts = query({ data: { id: SCRIPT_ID }, error: null })
    const protectedContent = query({
      data: {
        pdf_storage_path: `pdfs/${SCRIPT_ID}/new.pdf`,
        page_image_paths: [NEW_PAGE],
        updated_at: NEXT_REVISION,
      },
      error: null,
    })
    const from = vi.fn()
      .mockReturnValueOnce(scripts)
      .mockReturnValueOnce(protectedContent)
    mocks.createClient.mockResolvedValue({ from })

    const result = await deleteAllScriptFiles(
      SCRIPT_ID,
      "删除已确认弃用的剧本文件",
      `pdfs/${SCRIPT_ID}/old.pdf`,
      [OLD_PAGE],
    )

    expect(result).toEqual({ error: "剧本文件已被其他管理员修改，请刷新后重试" })
    expect(protectedContent.update).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
