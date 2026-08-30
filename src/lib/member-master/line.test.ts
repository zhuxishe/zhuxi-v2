import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  buildLineBridgeEmail,
  buildLineMemberInsert,
  insertLineMemberRecord,
  isLineBridgeAuthUser,
  serviceSetMemberLineIdentity,
  toPublicLineIdentityError,
} from "./line"

describe("LINE canonical member contract", () => {
  const input = {
    userId: "auth-user-id",
    email: "line_U123@line.zhuxi.app",
    lineUserId: "U123",
    linkedAt: "2026-08-30T01:02:03.000Z",
  }

  it("creates a not-started active LINE source record", () => {
    expect(buildLineMemberInsert(input)).toEqual({
      user_id: "auth-user-id",
      email: "line_U123@line.zhuxi.app",
      line_user_id: "U123",
      status: "pending",
      account_status: "active",
      profile_stage: "not_started",
      record_source: "line",
      account_linked_at: "2026-08-30T01:02:03.000Z",
      onboarding_step: 0,
    })
  })

  it("writes only through the server-provided client", async () => {
    const insert = async (value: Record<string, unknown>) => ({ error: null, value })
    const from = (table: string) => ({ insert })

    const result = await insertLineMemberRecord({ from }, input)

    expect(result.error).toBeNull()
  })

  it("calls the service-only identity RPC with the locked contract", async () => {
    const rpc = async (name: string, args: Record<string, unknown>) => ({
      data: { name, args },
      error: null,
    })

    await expect(serviceSetMemberLineIdentity({ rpc }, {
      userId: "auth-user-id",
      lineUserId: "U123",
      operation: "bind",
    })).resolves.toEqual({
      data: {
        name: "service_set_member_line_identity",
        args: {
          p_user_id: "auth-user-id",
          p_line_user_id: "U123",
          p_operation: "bind",
        },
      },
      error: null,
    })
  })

  it("distinguishes LINE-native Auth users from normal Auth users with LINE attached", () => {
    const email = buildLineBridgeEmail("U123")

    expect(isLineBridgeAuthUser({
      email,
      app_metadata: { auth_origin: "line_bridge", line_user_id: "U123" },
    }, "U123")).toBe(true)
    expect(isLineBridgeAuthUser({ email }, "U123")).toBe(true)
    expect(isLineBridgeAuthUser({
      email: "member@example.com",
      app_metadata: { provider: "google" },
    }, "U123")).toBe(false)
    expect(isLineBridgeAuthUser({
      email,
      app_metadata: { auth_origin: "email", line_user_id: "U123" },
    }, "U123")).toBe(false)
  })

  it("maps database identity conflicts to safe public errors", () => {
    expect(toPublicLineIdentityError({
      code: "23505",
      message: "MEMBER_MASTER_LINE_IDENTITY_CONFLICT",
    })).toEqual({
      status: 409,
      code: "line_identity_conflict",
      message: "This LINE account cannot be linked to this user",
    })
    expect(toPublicLineIdentityError({
      code: "XX000",
      message: "internal table details",
    })).toEqual({
      status: 500,
      code: "line_identity_update_failed",
      message: "LINE account update failed",
    })
  })

  it("keeps LINE first-login creation server-only and repeat login idempotent", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/auth/line/route.ts"),
      "utf8"
    )
    const existingBranch = route.indexOf("if (existingMember)")
    const createAuthUser = route.indexOf("auth.admin.createUser")

    expect(route).toContain("insertLineMemberRecord(supabase")
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY")
    expect(existingBranch).toBeGreaterThan(-1)
    expect(createAuthUser).toBeGreaterThan(existingBranch)
    expect(route.slice(existingBranch, createAuthUser)).toContain("isNewUser: false")
  })

  it("uses the audited RPC for self bind/unbind and never directly updates members", () => {
    const callback = readFileSync(
      resolve(process.cwd(), "src/app/api/auth/line/callback/route.ts"),
      "utf8"
    )
    const link = readFileSync(
      resolve(process.cwd(), "src/app/api/auth/line/link/route.ts"),
      "utf8"
    )

    for (const route of [callback, link]) {
      expect(route).toContain("serviceSetMemberLineIdentity")
      expect(route).not.toContain('.from("members")')
      expect(route).not.toContain("line_user_id: null")
      expect(route).not.toContain(".update({ line_user_id")
    }
    expect(callback).toContain('operation: "bind"')
    expect(link).toContain('operation: "bind"')
    expect(link).toContain('operation: "unbind"')
  })

  it("carries the canonical profile LINE id into compare-and-clear unbind", () => {
    const profilePage = readFileSync(
      resolve(process.cwd(), "src/app/app/profile/page.tsx"),
      "utf8"
    )
    const settings = readFileSync(
      resolve(process.cwd(), "src/components/player/profile/ProfileSettingsCard.tsx"),
      "utf8"
    )
    const binding = readFileSync(
      resolve(process.cwd(), "src/components/player/LineBindingCard.tsx"),
      "utf8"
    )

    expect(profilePage).toContain("lineUserId={profile.lineUserId}")
    expect(settings).toContain("<LineBindingCard lineUserId={lineUserId}")
    expect(binding).toContain("JSON.stringify({ lineUserId: initial })")
  })

  it("locks the service-only RPC, provenance and append-only audit contract", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260829175645_user_member_master_v1.sql"),
      "utf8"
    )
    const functionStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.service_set_member_line_identity("
    )
    const functionEnd = migration.indexOf("CREATE OR REPLACE FUNCTION ", functionStart + 1)
    const rpc = migration.slice(functionStart, functionEnd)
    const lifecycleStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION private.member_master_sync_lifecycle()"
    )
    const lifecycleEnd = migration.indexOf("CREATE OR REPLACE FUNCTION ", lifecycleStart + 1)
    const lifecycle = migration.slice(lifecycleStart, lifecycleEnd)

    expect(functionStart).toBeGreaterThan(-1)
    expect(rpc).toContain("p_user_id uuid")
    expect(rpc).toContain("p_line_user_id text")
    expect(rpc).toContain("p_operation text")
    expect(rpc).toContain("auth.jwt()->>'role'")
    expect(rpc).toContain("'service_role'")
    expect(rpc).toContain("hashtextextended('line:' || v_lock_line_user_id, 0)")
    expect(rpc).toContain("'service_identity_link'")
    expect(rpc).toContain("'line_self_service'")
    expect(rpc).toContain("'LINE_SELF_BIND'")
    expect(rpc).toContain("'LINE_SELF_UNBIND'")
    expect(rpc).not.toContain("record_source = CASE")
    expect(lifecycle).not.toContain(
      "NEW.record_source = 'app' AND NEW.line_user_id IS NOT NULL"
    )
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.service_set_member_line_identity(uuid, text, text)\n  FROM PUBLIC, anon, authenticated, service_role;"
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.service_set_member_line_identity(uuid, text, text)\n  TO service_role;"
    )
    expect(migration).toContain(
      "CASE WHEN TG_OP = 'INSERT' THEN 'member_created' ELSE 'member_lifecycle_update' END"
    )
  })

  it("best-effort removes a newly created Auth user when member creation fails", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/auth/line/route.ts"),
      "utf8"
    )
    const failureBranch = route.slice(
      route.indexOf("if (memberError)"),
      route.indexOf("// Sign in")
    )

    expect(failureBranch).toContain("auth.admin.deleteUser(newUser.user.id)")
    expect(failureBranch).toContain("rollbackError.code")
    expect(failureBranch).not.toContain("profile.userId")
    expect(failureBranch).not.toContain("access_token")
    expect(failureBranch).not.toContain("refresh_token")
  })
})
