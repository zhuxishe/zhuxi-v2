import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock("@/lib/auth/community", () => ({ requireCommunityAccess: vi.fn() }))
vi.mock("@/lib/community/rpc", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/community/rpc")>(), callCommunityRpc: mocks.rpc,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))

import { canCurrentUserUseReservedNickname } from "./nickname-permissions"
import { saveCommunityProfileAction } from "@/app/app/profile/community/actions"

function signedIn(email: string, confirmed: string | null = "2026-10-03T00:00:00Z") {
  mocks.getUser.mockResolvedValue({ data: { user: { email, email_confirmed_at: confirmed } }, error: null })
}

function nicknameForm(nickname = "竹溪社官方") {
  const form = new FormData()
  form.set("nickname", nickname)
  form.set("avatarKind", "default")
  return form
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
})

describe("official nickname exemption", () => {
  it.each(["zhuxishe@gmail.com", "tsyronjp@gmail.com", "tokyojht4@gmail.com", "ZHUXISHE@GMAIL.COM"])(
    "allows the verified official account %s to save a reserved nickname", async email => {
      signedIn(email)
      expect(await saveCommunityProfileAction({}, nicknameForm(" ａｄｍｉｎ "))).toEqual({ success: true })
      expect(mocks.getUser).toHaveBeenCalledOnce()
      expect(mocks.rpc).toHaveBeenCalledWith("community_upsert_profile", expect.objectContaining({ p_nickname: "admin" }))
    },
  )

  it.each(["player@example.com", "zhuxishe+test@gmail.com", "zhuxishe@gmail.com.example.com"])(
    "keeps the reserved-name restriction for %s", async email => {
      signedIn(email)
      expect(await saveCommunityProfileAction({}, nicknameForm())).toMatchObject({ error: "这个昵称由系统保留" })
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )

  it("does not trust form fields, metadata or administrator status as an exemption", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: {
      email: "other-admin@example.com", email_confirmed_at: "2026-10-03T00:00:00Z",
      user_metadata: { email: "zhuxishe@gmail.com", official: true }, app_metadata: { role: "admin" },
    } }, error: null })
    const form = nicknameForm()
    form.set("email", "zhuxishe@gmail.com")
    form.set("allowReservedNickname", "true")
    expect(await saveCommunityProfileAction({}, form)).toMatchObject({ error: "这个昵称由系统保留" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("requires the allowlisted email to be confirmed", async () => {
    signedIn("zhuxishe@gmail.com", null)
    expect(await canCurrentUserUseReservedNickname()).toBe(false)
  })

  it("does not grant an exemption when Auth verification fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 500 } })
    await expect(saveCommunityProfileAction({}, nicknameForm())).rejects.toThrow("Authentication is temporarily unavailable")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("retains nickname length and avatar checks for official accounts", async () => {
    signedIn("tsyronjp@gmail.com")
    expect(await saveCommunityProfileAction({}, nicknameForm("竹"))).toMatchObject({ error: "昵称需要 2–20 个字符" })
    const form = nicknameForm()
    form.set("avatarKind", "invalid")
    expect(await saveCommunityProfileAction({}, form)).toEqual({ error: "请选择社区头像" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("still returns a database rejection instead of claiming a save succeeded", async () => {
    signedIn("tokyojht4@gmail.com")
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "nickname unique violation", code: "23505" } })
    expect(await saveCommunityProfileAction({}, nicknameForm())).toEqual({ error: "这个社区昵称已经被使用" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
