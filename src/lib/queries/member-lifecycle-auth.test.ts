import { describe, expect, it, vi } from "vitest"
import type { MemberSectionUpdateResult } from "@/types"
import {
  coordinateMemberAnonymization,
  coordinateMemberLifecycle,
  MEMBER_AUTH_BAN_DURATION,
} from "./member-lifecycle-auth"

const databaseResult: MemberSectionUpdateResult = {
  memberId: "f049f125-e2c2-42ac-b0e7-096592c62d2b",
  section: "lifecycle",
  updatedAt: "2026-08-30T10:00:00.000Z",
  changedFields: ["account_status"],
  eventId: 12,
  data: { account_status: "suspended" },
}

describe("coordinateMemberLifecycle", () => {
  it("skips Auth for an accountless member and writes only the database", async () => {
    const updateUserById = vi.fn()
    const mutateDatabase = vi.fn().mockResolvedValue(databaseResult)

    const result = await coordinateMemberLifecycle({
      userId: null,
      previousAccountStatus: "unbound",
      targetAccountStatus: "suspended",
      authAdmin: { updateUserById },
      mutateDatabase,
    })

    expect(result.authSync).toBe("not_applicable")
    expect(updateUserById).not.toHaveBeenCalled()
    expect(mutateDatabase).toHaveBeenCalledOnce()
  })

  it("bans Auth before committing a suspended database status", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const mutateDatabase = vi.fn().mockResolvedValue(databaseResult)

    const result = await coordinateMemberLifecycle({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      targetAccountStatus: "suspended",
      authAdmin: { updateUserById },
      mutateDatabase,
    })

    expect(result.authSync).toBe("synchronized")
    expect(updateUserById).toHaveBeenCalledWith(
      "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      { ban_duration: MEMBER_AUTH_BAN_DURATION },
    )
    expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(mutateDatabase.mock.invocationCallOrder[0])
  })

  it("does not touch the database when the Auth update fails", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: { message: "auth unavailable" } })
    const mutateDatabase = vi.fn().mockResolvedValue(databaseResult)

    await expect(coordinateMemberLifecycle({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      targetAccountStatus: "closed",
      authAdmin: { updateUserById },
      mutateDatabase,
    })).rejects.toMatchObject({ stage: "auth", databaseMayHaveChanged: false })

    expect(mutateDatabase).not.toHaveBeenCalled()
  })

  it("unbans again when the database RPC fails after a ban", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const mutateDatabase = vi.fn().mockRejectedValue(new Error("RPC failed"))

    await expect(coordinateMemberLifecycle({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      targetAccountStatus: "suspended",
      authAdmin: { updateUserById },
      mutateDatabase,
    })).rejects.toMatchObject({ stage: "database", databaseMayHaveChanged: false })

    expect(updateUserById).toHaveBeenNthCalledWith(
      1,
      "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      { ban_duration: MEMBER_AUTH_BAN_DURATION },
    )
    expect(updateUserById).toHaveBeenNthCalledWith(
      2,
      "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      { ban_duration: "none" },
    )
  })

  it("reports a partial-state error when Auth compensation also fails", async () => {
    const updateUserById = vi.fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "compensation failed" } })

    await expect(coordinateMemberLifecycle({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "suspended",
      targetAccountStatus: "active",
      authAdmin: { updateUserById },
      mutateDatabase: vi.fn().mockRejectedValue(new Error("RPC failed")),
    })).rejects.toMatchObject({ stage: "compensation" })
  })
})

describe("coordinateMemberAnonymization", () => {
  const unlinkedResult: MemberSectionUpdateResult = {
    ...databaseResult,
    data: { account_status: "closed", auth_bound: false, anonymized_at: "2026-08-30T10:00:00.000Z" },
  }

  it("uses the database-only path when no Auth user is linked", async () => {
    const updateUserById = vi.fn()
    const deleteUser = vi.fn()
    const mutateDatabase = vi.fn().mockResolvedValue(unlinkedResult)
    const result = await coordinateMemberAnonymization({
      userId: null,
      previousAccountStatus: "unbound",
      authAdmin: { updateUserById, deleteUser },
      mutateDatabase,
    })
    expect(result.authSync).toBe("not_applicable")
    expect(updateUserById).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it("runs ban, database unlink, then hard Auth deletion in that order", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const getUserById = vi.fn().mockResolvedValue({ exists: true, error: null })
    const mutateDatabase = vi.fn().mockResolvedValue(unlinkedResult)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const finalizeDatabase = vi.fn().mockResolvedValue({ auth_delete_completed: true })
    const userId = "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4"

    const result = await coordinateMemberAnonymization({
      userId,
      previousAccountStatus: "active",
      authAdmin: { updateUserById, deleteUser, getUserById },
      mutateDatabase,
      finalizeDatabase,
    })

    expect(result.authSync).toBe("deleted")
    expect(updateUserById).toHaveBeenCalledWith(userId, { ban_duration: MEMBER_AUTH_BAN_DURATION })
    expect(deleteUser).toHaveBeenCalledWith(userId, false)
    expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(mutateDatabase.mock.invocationCallOrder[0])
    expect(mutateDatabase.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0])
    expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(finalizeDatabase.mock.invocationCallOrder[0])
  })

  it("restores the previous Auth state when database anonymization fails", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const getUserById = vi.fn().mockResolvedValue({ exists: true, error: null })
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    await expect(coordinateMemberAnonymization({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      authAdmin: { updateUserById, deleteUser, getUserById },
      mutateDatabase: vi.fn().mockRejectedValue(new Error("RPC failed")),
    })).rejects.toMatchObject({ stage: "database", databaseMayHaveChanged: false })
    expect(updateUserById).toHaveBeenNthCalledWith(2, expect.any(String), { ban_duration: "none" })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it("refuses Auth deletion when the database reports a retained canonical link", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const getUserById = vi.fn().mockResolvedValue({ exists: true, error: null })
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    await expect(coordinateMemberAnonymization({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      authAdmin: { updateUserById, deleteUser, getUserById },
      mutateDatabase: vi.fn().mockResolvedValue({
        ...unlinkedResult,
        data: { canonical_user_link_retained: true },
      }),
    })).rejects.toMatchObject({ stage: "database_unlink", databaseMayHaveChanged: true })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(updateUserById).toHaveBeenCalledTimes(1)
  })

  it("reports retry-needed partial state and leaves Auth banned when deletion fails", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const getUserById = vi.fn().mockResolvedValue({ exists: true, error: null })
    const deleteUser = vi.fn().mockResolvedValue({ error: { message: "delete failed" } })
    await expect(coordinateMemberAnonymization({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      authAdmin: { updateUserById, deleteUser, getUserById },
      mutateDatabase: vi.fn().mockResolvedValue(unlinkedResult),
    })).rejects.toMatchObject({ stage: "auth_deletion", databaseMayHaveChanged: true })
    expect(updateUserById).toHaveBeenCalledTimes(1)
    expect(deleteUser).toHaveBeenCalledOnce()
  })

  it("surfaces post-delete partial state when the tombstone completion RPC fails", async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    await expect(coordinateMemberAnonymization({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "active",
      authAdmin: {
        updateUserById,
        deleteUser,
        getUserById: vi.fn().mockResolvedValue({ exists: true, error: null }),
      },
      mutateDatabase: vi.fn().mockResolvedValue(unlinkedResult),
      finalizeDatabase: vi.fn().mockRejectedValue(new Error("completion RPC failed")),
    })).rejects.toMatchObject({ stage: "completion", databaseMayHaveChanged: true })
    expect(deleteUser).toHaveBeenCalledOnce()
  })

  it("retries only the completion marker when Auth is already gone", async () => {
    const updateUserById = vi.fn()
    const deleteUser = vi.fn()
    const mutateDatabase = vi.fn()
    const finalizeDatabase = vi.fn().mockResolvedValue({ auth_delete_completed: true })
    const result = await coordinateMemberAnonymization({
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      previousAccountStatus: "closed",
      alreadyAnonymized: true,
      authAdmin: {
        updateUserById,
        deleteUser,
        getUserById: vi.fn().mockResolvedValue({ exists: false, error: null }),
      },
      mutateDatabase,
      finalizeDatabase,
    })
    expect(result.authSync).toBe("deleted")
    expect(mutateDatabase).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
    expect(finalizeDatabase).toHaveBeenCalledOnce()
  })
})
