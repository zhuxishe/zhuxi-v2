import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), getSession: vi.fn(),
  ensure: vi.fn(), snapshot: vi.fn(), redirect: vi.fn(),
}))
vi.mock("react", () => ({ cache: (callback: unknown) => callback }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/member-master/rpc", () => ({
  ensureMyMemberRecord: mocks.ensure,
  resolveMemberRouteSnapshot: mocks.snapshot,
  getMemberMasterDiagnostic: () => "TEST",
}))

import { getPlayerInfo, requireAuth, requirePlayer } from "./player"
import { AuthTemporarilyUnavailableError } from "./verified-user"

const verifiedUser = { id: "verified-auth-user" }
const transientErrors = [
  { name: "AuthRetryableFetchError", status: 0 },
  { name: "AuthRetryableFetchError", status: 503 },
  { name: "AuthApiError", status: 500, code: "unexpected_failure" },
  { name: "AuthApiError", status: 504 },
  { name: "AuthApiError", status: 408, code: "request_timeout" },
  { name: "AuthApiError", status: 429, code: "over_request_rate_limit" },
  { name: "AuthUnknownError" },
]
const signedOutErrors = [
  { name: "AuthSessionMissingError", status: 400 },
  { name: "AuthApiError", status: 401 },
  { name: "AuthApiError", status: 403 },
  { name: "AuthApiError", status: 400, code: "refresh_token_not_found" },
  { name: "AuthApiError", status: 400, code: "session_expired" },
]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`) })
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser, getSession: mocks.getSession } })
  mocks.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null })
  mocks.ensure.mockResolvedValue({ memberId: "canonical-member" })
  mocks.snapshot.mockResolvedValue({
    memberId: "canonical-member", memberNumber: null, membershipType: "player",
    fullName: "Verified Player", status: "approved", accountStatus: "active", profileStage: "complete",
    onboardingStep: 4, lastProfileSavedAt: null, submittedAt: null, hasIdentity: true,
  })
})

describe.each([
  ["requireAuth", requireAuth], ["getPlayerInfo", getPlayerInfo], ["requirePlayer", requirePlayer],
] as const)("%s remote authentication", (_name, read) => {
  it.each(transientErrors)("retains the route on a returned temporary Auth error: %o", async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(read()).rejects.toBeInstanceOf(AuthTemporarilyUnavailableError)
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.ensure).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("treats a thrown connection timeout as retryable without authorizing from local session data", async () => {
    mocks.getUser.mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), {
      cause: { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" },
    }))
    mocks.getSession.mockResolvedValue({ data: { session: { user: verifiedUser } }, error: null })
    await expect(read()).rejects.toMatchObject({ name: "AuthTemporarilyUnavailableError", retryable: true })
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.ensure).not.toHaveBeenCalled()
  })

  it("does not trust a user result when Auth also reports a verification failure", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: transientErrors[0] })
    await expect(read()).rejects.toBeInstanceOf(AuthTemporarilyUnavailableError)
    expect(mocks.ensure).not.toHaveBeenCalled()
  })
})

describe("confirmed signed-out behavior", () => {
  it.each(signedOutErrors)("continues login routing on a confirmed invalid session: %o", async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error })
    await expect(requireAuth()).rejects.toThrow("redirect:/login")
    expect(await getPlayerInfo()).toBeNull()
    await expect(requirePlayer()).rejects.toThrow("redirect:/login")
    expect(mocks.ensure).not.toHaveBeenCalled()
  })

  it("continues login routing when Auth successfully reports no user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(requireAuth()).rejects.toThrow("redirect:/login")
    expect(await getPlayerInfo()).toBeNull()
  })

  it("can verify and resolve the canonical member after a temporary failure is retried", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: transientErrors[0] })
    await expect(requireAuth()).rejects.toBeInstanceOf(AuthTemporarilyUnavailableError)
    expect(await requireAuth()).toEqual(verifiedUser)
    expect(await requirePlayer()).toMatchObject({ memberId: "canonical-member", status: "approved" })
    expect(mocks.ensure).toHaveBeenCalledOnce()
    expect(mocks.getSession).not.toHaveBeenCalled()
  })
})
