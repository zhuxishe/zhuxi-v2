import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("member master auth integration contract", () => {
  it("ensures then resolves RLS-aware canonical state before callback routing", () => {
    const callback = source("src/app/login/callback/route.ts")
    const ensureIndex = callback.indexOf("await ensureMyMemberRecord")
    const resolveIndex = callback.indexOf("await resolveMemberRouteSnapshot")
    const routeIndex = callback.indexOf("resolvePlayerRoute(", resolveIndex)

    expect(ensureIndex).toBeGreaterThan(-1)
    expect(resolveIndex).toBeGreaterThan(ensureIndex)
    expect(routeIndex).toBeGreaterThan(resolveIndex)
  })

  it("keeps direct /app entry callback-independent", () => {
    const layout = source("src/app/app/layout.tsx")
    const player = source("src/lib/auth/player.ts")

    expect(layout).toContain("requireMemberRecord()")
    expect(player).toContain("await ensureMyMemberRecord(supabase)")
    expect(player).toContain("resolveMemberRouteSnapshot(supabase, ensured)")
    expect(player).toContain("getPlayerInfo = cache(")
  })

  it("does not direct-select a blocked member hidden by self-read RLS", () => {
    const rpc = source("src/lib/member-master/rpc.ts")
    const adapter = rpc.slice(rpc.indexOf("export async function resolveMemberRouteSnapshot"))
    const blockedBranch = adapter.indexOf('ensured.accountStatus !== "active"')
    const directRead = adapter.indexOf("fetchCanonicalMemberSnapshot(")

    expect(blockedBranch).toBeGreaterThan(-1)
    expect(directRead).toBeGreaterThan(blockedBranch)
  })

  it("legacy callback cannot auto-claim a member by email", () => {
    const legacyAction = source("src/app/app/login/actions.ts")
    const callbackSection = legacyAction.slice(legacyAction.indexOf("export async function handleAuthCallback"))

    expect(callbackSection).toContain("ensureMyMemberRecord(supabase)")
    expect(callbackSection).not.toContain("createAdminClient")
    expect(callbackSection).not.toContain('.eq("email"')
    expect(callbackSection).not.toContain("user_id: user.id")
  })

  it("legacy magic links do not use member email as an ownership or approval check", () => {
    const legacyAction = source("src/app/app/login/actions.ts")
    const magicLinkSection = legacyAction.slice(
      legacyAction.indexOf("export async function sendMagicLink"),
      legacyAction.indexOf("export async function handleAuthCallback")
    )

    expect(magicLinkSection).not.toContain('.from("members")')
    expect(magicLinkSection).not.toContain('.eq("email"')
    expect(magicLinkSection).not.toContain("accountNotApproved")
    expect(magicLinkSection).toContain("shouldCreateUser: false")
    expect(magicLinkSection).toContain('buildPublicUrl("/login/callback")')
  })

  it("creates a canonical member before the admin callback reaches admin routing", () => {
    const adminCallback = source("src/app/admin/login/callback/route.ts")
    const exchangeIndex = adminCallback.indexOf("exchangeCodeForSession(code)")
    const ensureIndex = adminCallback.indexOf("await ensureMyMemberRecord(supabase)")
    const adminRedirectIndex = adminCallback.lastIndexOf('new URL("/admin"')

    expect(exchangeIndex).toBeGreaterThan(-1)
    expect(ensureIndex).toBeGreaterThan(exchangeIndex)
    expect(adminRedirectIndex).toBeGreaterThan(ensureIndex)
    expect(adminCallback).not.toContain('.eq("email"')
    expect(adminCallback).not.toContain("createAdminClient")
  })
})
