import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

import { createScript } from "./actions"

const validInput = {
  request_id: "11111111-1111-4111-8111-111111111111",
  title: "测试剧本",
  title_ja: "",
  description: "",
  author: "",
  cover_url: "https://images.example.net/cover.webp" as string | null,
  player_count_min: 4,
  player_count_max: 6,
  duration_minutes: 180,
  difficulty: "intermediate",
  genre_tags: [],
  theme_tags: [],
  content_html: "",
  warnings: [],
  roles: [],
  is_published: false,
  is_player_visible: false,
  is_social_script: false,
  show_on_player_activity: false,
  player_activity_order: 0,
  pin_in_social_library: false,
  social_library_order: 0,
}

describe("createScript external cover validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      role: "admin",
    })
  })

  it.each([
    "https://api.zhuxishe.com/storage/v1/object/public/scripts-covers/covers/11111111-1111-4111-8111-111111111111/cover.webp",
    "https://api.zhuxishe.com/storage/v1/render/image/public/scripts-covers/covers/11111111-1111-4111-8111-111111111111/cover.webp",
    "https://api.zhuxishe.com/storage/v1/object/sign/scripts/pdfs/11111111-1111-4111-8111-111111111111/original.pdf?token=secret",
  ])("rejects a managed Storage URL submitted as an external cover: %s", async (coverUrl) => {
    const result = await createScript({ ...validInput, cover_url: coverUrl }, "录入测试剧本资料")

    expect(result).toEqual({ error: "外部封面必须使用有效的 HTTPS 链接" })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
