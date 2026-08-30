import type { MemberSectionUpdateResult } from "@/types"

export const MEMBER_AUTH_BAN_DURATION = "876000h" as const

type AuthAdminUpdateResult = {
  error: { message: string } | null
}

type AuthAdminLookupResult = {
  exists: boolean
  error: { message: string } | null
}

export interface MemberLifecycleAuthAdmin {
  updateUserById(
    userId: string,
    attributes: { ban_duration: string | "none" },
  ): Promise<AuthAdminUpdateResult>
  deleteUser?(userId: string, shouldSoftDelete?: boolean): Promise<AuthAdminUpdateResult>
  getUserById?(userId: string): Promise<AuthAdminLookupResult>
}

export type MemberLifecycleAuthSync = "synchronized" | "deleted" | "not_applicable"

export interface MemberLifecycleCoordinationResult {
  database: MemberSectionUpdateResult | null
  authSync: MemberLifecycleAuthSync
}

export class MemberLifecycleCoordinationError extends Error {
  readonly stage: "auth" | "auth_lookup" | "database" | "compensation" | "database_unlink" | "auth_deletion" | "completion"
  readonly databaseMayHaveChanged: boolean

  constructor(
    message: string,
    options: {
      stage: "auth" | "auth_lookup" | "database" | "compensation" | "database_unlink" | "auth_deletion" | "completion"
      databaseMayHaveChanged?: boolean
      cause?: unknown
    },
  ) {
    super(message, { cause: options.cause })
    this.name = "MemberLifecycleCoordinationError"
    this.stage = options.stage
    this.databaseMayHaveChanged = options.databaseMayHaveChanged ?? false
  }
}

function desiredBanDuration(accountStatus: string | null): string | "none" {
  return accountStatus === "suspended" || accountStatus === "closed"
    ? MEMBER_AUTH_BAN_DURATION
    : "none"
}

async function updateAuthBan(
  authAdmin: MemberLifecycleAuthAdmin,
  userId: string,
  banDuration: string | "none",
) {
  const { error } = await authAdmin.updateUserById(userId, { ban_duration: banDuration })
  if (error) throw new Error(error.message)
}

/**
 * Coordinates the external GoTrue state before the database RPC.
 *
 * Auth is changed first because `closed` and anonymization are intentionally
 * irreversible through the lifecycle RPC. If the database RPC then fails, the
 * previous Auth ban state is restored on a best-effort basis. A compensation
 * failure is surfaced as a partial-state error and is never reported as success.
 */
export async function coordinateMemberLifecycle(input: {
  userId: string | null
  previousAccountStatus: string | null
  targetAccountStatus: "active" | "suspended" | "closed"
  authAdmin: MemberLifecycleAuthAdmin
  mutateDatabase: () => Promise<MemberSectionUpdateResult>
}): Promise<MemberLifecycleCoordinationResult> {
  if (!input.userId) {
    return {
      database: await input.mutateDatabase(),
      authSync: "not_applicable",
    }
  }

  const desired = desiredBanDuration(input.targetAccountStatus)
  const compensation = desiredBanDuration(input.previousAccountStatus)

  try {
    await updateAuthBan(input.authAdmin, input.userId, desired)
  } catch (error) {
    throw new MemberLifecycleCoordinationError(
      "Supabase Auth 登录状态更新失败，数据库未修改；请核对 Auth 用户后重试。",
      { stage: "auth", cause: error },
    )
  }

  try {
    return {
      database: await input.mutateDatabase(),
      authSync: "synchronized",
    }
  } catch (databaseError) {
    try {
      await updateAuthBan(input.authAdmin, input.userId, compensation)
    } catch (compensationError) {
      throw new MemberLifecycleCoordinationError(
        "数据库写入失败，Supabase Auth 补偿也失败；两层状态可能不一致，请立即人工核对。",
        {
          stage: "compensation",
          databaseMayHaveChanged: false,
          cause: { databaseError, compensationError },
        },
      )
    }

    throw new MemberLifecycleCoordinationError(
      "数据库写入失败；Supabase Auth 已恢复操作前状态，本次操作未完成。",
      { stage: "database", cause: databaseError },
    )
  }
}

/**
 * Privacy deletion is deliberately a separate three-stage flow:
 * ban Auth -> anonymize/unlink in DB -> hard-delete the Auth account.
 * If Auth deletion fails, the orphan stays banned and the error explicitly
 * reports a retry-needed partial state. Existing sessions are still governed
 * by the closed/anonymized database state and RLS.
 */
export async function coordinateMemberAnonymization(input: {
  userId: string | null
  previousAccountStatus: string | null
  alreadyAnonymized?: boolean
  authAdmin: MemberLifecycleAuthAdmin
  mutateDatabase: () => Promise<MemberSectionUpdateResult>
  finalizeDatabase?: () => Promise<unknown>
}): Promise<MemberLifecycleCoordinationResult> {
  if (!input.userId) {
    return {
      database: input.alreadyAnonymized ? null : await input.mutateDatabase(),
      authSync: "not_applicable",
    }
  }
  if (!input.authAdmin.deleteUser || !input.authAdmin.getUserById) {
    throw new MemberLifecycleCoordinationError(
      "服务器未配置 Auth 删除能力，数据库未修改。",
      { stage: "auth" },
    )
  }

  const lookup = await input.authAdmin.getUserById(input.userId)
  if (lookup.error) {
    throw new MemberLifecycleCoordinationError(
      "无法确认 Supabase Auth 用户是否仍存在；本次未继续执行，请稍后重试。",
      { stage: "auth_lookup", databaseMayHaveChanged: input.alreadyAnonymized, cause: lookup.error },
    )
  }
  const authUserExists = lookup.exists

  if (authUserExists) {
    try {
      await updateAuthBan(input.authAdmin, input.userId, MEMBER_AUTH_BAN_DURATION)
    } catch (error) {
      throw new MemberLifecycleCoordinationError(
        input.alreadyAnonymized
          ? "数据库已匿名化，但 Supabase Auth 封禁重试失败；请立即核对孤立 Auth 用户。"
          : "Supabase Auth 封禁失败，数据库未匿名化；请核对 Auth 用户后重试。",
        { stage: "auth", databaseMayHaveChanged: input.alreadyAnonymized, cause: error },
      )
    }
  }

  let database: MemberSectionUpdateResult | null = null
  if (!input.alreadyAnonymized) {
    try {
      database = await input.mutateDatabase()
    } catch (databaseError) {
      if (authUserExists) {
        try {
          await updateAuthBan(
            input.authAdmin,
            input.userId,
            desiredBanDuration(input.previousAccountStatus),
          )
        } catch (compensationError) {
          throw new MemberLifecycleCoordinationError(
            "数据库匿名化失败，Supabase Auth 补偿也失败；两层状态可能不一致，请立即人工核对。",
            { stage: "compensation", cause: { databaseError, compensationError } },
          )
        }
      }
      throw new MemberLifecycleCoordinationError(
        authUserExists
          ? "数据库匿名化失败；Supabase Auth 已恢复操作前状态，本次操作未完成。"
          : "数据库匿名化失败；Auth 用户原本已不存在，本次操作未完成。",
        { stage: "database", cause: databaseError },
      )
    }
  }

  if (database?.data?.canonical_user_link_retained === true || database?.data?.auth_bound === true) {
    throw new MemberLifecycleCoordinationError(
      "数据库资料已匿名化，但 canonical user_id 未解除；Auth 用户保持封禁且未删除，请部署修正后的匿名化 RPC 后重试清理。",
      { stage: "database_unlink", databaseMayHaveChanged: true },
    )
  }

  if (authUserExists) {
    const { error: deleteError } = await input.authAdmin.deleteUser(input.userId, false)
    if (deleteError) {
      throw new MemberLifecycleCoordinationError(
        "数据库已匿名化并解除绑定，但 Supabase Auth 用户删除失败；孤立 Auth 账号保持封禁，请重试清理。",
        { stage: "auth_deletion", databaseMayHaveChanged: true, cause: deleteError },
      )
    }
  }

  if (input.finalizeDatabase) {
    try {
      await input.finalizeDatabase()
    } catch (error) {
      throw new MemberLifecycleCoordinationError(
        "Supabase Auth 用户已删除且数据库资料已匿名化，但完成标记写入失败；请重试 Auth 清理收口。",
        { stage: "completion", databaseMayHaveChanged: true, cause: error },
      )
    }
  }

  return { database, authSync: "deleted" }
}
