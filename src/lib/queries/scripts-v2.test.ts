import { beforeEach, describe, expect, it, vi } from "vitest"

const createClient = vi.fn()
const createAdminClient = vi.fn()

vi.mock("@/lib/supabase/server", () => ({ createClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }))

type QueryResponse = {
  data: unknown
  error: { message?: string } | null
  count?: number | null
}

function queryResult(response: QueryResponse) {
  const promise = Promise.resolve(response)
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    or: vi.fn(),
    gt: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: promise.then.bind(promise),
  }
  for (const method of [query.select, query.eq, query.is, query.or, query.gt, query.lte, query.order, query.limit]) {
    method.mockReturnValue(query)
  }
  query.maybeSingle.mockResolvedValue(response)
  query.single.mockResolvedValue(response)
  return query
}

function clientForTables(queries: Record<string, ReturnType<typeof queryResult>>) {
  return {
    from: vi.fn((table: string) => {
      const query = queries[table]
      if (!query) throw new Error(`Unexpected table: ${table}`)
      return query
    }),
  }
}

const SCRIPT_ID = "11111111-1111-4111-8111-111111111111"
const MEMBER_ID = "22222222-2222-4222-8222-222222222222"

describe("scoped script readers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads only public metadata for a published, non-archived detail", async () => {
    const query = queryResult({ data: { id: SCRIPT_ID, title: "公开介绍" }, error: null })
    createClient.mockResolvedValueOnce(clientForTables({ scripts: query }))

    const { fetchPublicScript } = await import("./scripts")
    await fetchPublicScript(SCRIPT_ID)

    const projection = query.select.mock.calls[0][0] as string
    expect(projection).not.toMatch(/content_html|roles|pdf_url|page_images|core_content_html/)
    expect(query.eq).toHaveBeenCalledWith("is_published", true)
    expect(query.is).toHaveBeenCalledWith("archived_at", null)
  })

  it("fails closed before protected reads when the grant is not active", async () => {
    const memberQuery = queryResult({ data: { id: MEMBER_ID }, error: null })
    const accessQuery = queryResult({ data: null, error: null })
    createClient.mockResolvedValueOnce(clientForTables({
      members: memberQuery,
      script_play_records: accessQuery,
    }))

    const { fetchAuthorizedScriptContent } = await import("./scripts")
    const result = await fetchAuthorizedScriptContent(SCRIPT_ID, MEMBER_ID)

    expect(memberQuery.eq).toHaveBeenCalledWith("record_scope", "current")
    expect(memberQuery.eq).toHaveBeenCalledWith("status", "approved")
    expect(memberQuery.eq).toHaveBeenCalledWith("account_status", "active")
    expect(accessQuery.eq).toHaveBeenCalledWith("can_view_full", true)
    expect(accessQuery.lte).toHaveBeenCalledWith("granted_at", expect.any(String))
    expect(accessQuery.is).toHaveBeenCalledWith("revoked_at", null)
    expect(accessQuery.gt).toHaveBeenCalledWith("expires_at", expect.any(String))
    expect(accessQuery.or).not.toHaveBeenCalled()
    expect(result.canViewFull).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("uses RLS for protected content and signs only script-scoped private paths", async () => {
    const memberQuery = queryResult({ data: { id: MEMBER_ID }, error: null })
    const accessQuery = queryResult({ data: { id: "grant" }, error: null })
    const protectedQuery = queryResult({
      data: {
        script_id: SCRIPT_ID,
        core_content_html: "<p>核心内容</p>",
        roles: [{ name: "角色 A" }],
        pdf_storage_path: `pdfs/${SCRIPT_ID}/original.pdf`,
        page_image_paths: [
          `pages/${SCRIPT_ID}/page_001.webp`,
          "pages/another-script/page_002.webp",
          `pages/${SCRIPT_ID}/../escape.webp`,
        ],
        page_count: 3,
      },
      error: null,
    })
    const authorizationClient = clientForTables({
      members: memberQuery,
      script_play_records: accessQuery,
    })
    const protectedClient = clientForTables({ script_protected_content: protectedQuery })
    createClient
      .mockResolvedValueOnce(authorizationClient)
      .mockResolvedValueOnce(protectedClient)

    const createSignedUrl = vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed.invalid/${path}` },
      error: null,
    }))
    const storageFrom = vi.fn().mockReturnValue({ createSignedUrl })
    createAdminClient.mockReturnValue({ storage: { from: storageFrom } })

    const { fetchAuthorizedScriptContent } = await import("./scripts")
    const result = await fetchAuthorizedScriptContent(SCRIPT_ID, MEMBER_ID)

    expect(protectedClient.from).toHaveBeenCalledWith("script_protected_content")
    expect(storageFrom).toHaveBeenCalledWith("scripts")
    expect(createSignedUrl).toHaveBeenCalledTimes(2)
    expect(createSignedUrl).toHaveBeenCalledWith(`pdfs/${SCRIPT_ID}/original.pdf`, 300)
    expect(createSignedUrl).toHaveBeenCalledWith(`pages/${SCRIPT_ID}/page_001.webp`, 300)
    expect(result).toMatchObject({
      canViewFull: true,
      coreContentHtml: "<p>核心内容</p>",
      pageCount: 3,
    })
    expect(result.pageImageUrls).toEqual([
      `https://signed.invalid/pages/${SCRIPT_ID}/page_001.webp`,
    ])
  })
})
