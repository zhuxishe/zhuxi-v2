import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

function section(path: string, start: string, end?: string) {
  const text = source(path)
  const startIndex = text.indexOf(start)
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : text.length
  expect(startIndex).toBeGreaterThanOrEqual(0)
  if (end) expect(endIndex).toBeGreaterThan(startIndex)
  return text.slice(startIndex, endIndex)
}

function expectGuardedServiceRead(text: string) {
  const guardIndex = text.indexOf("await requireAdmin()")
  const serviceIndex = text.indexOf("createAdminClient()")
  expect(guardIndex).toBeGreaterThanOrEqual(0)
  expect(serviceIndex).toBeGreaterThan(guardIndex)
}

describe("legacy admin member-read compatibility contract", () => {
  it.each([
    ["src/lib/queries/admin.ts", "export async function fetchDashboardStats"],
    ["src/lib/queries/members.ts", "export async function fetchMemberBriefList"],
    ["src/lib/queries/pool-members.ts", "export async function fetchPoolMembers"],
    ["src/lib/queries/rounds.ts", "export async function fetchRoundSubmissions"],
    ["src/lib/queries/cancellations.ts", "export async function fetchPendingCancellations"],
  ])("guards the service-role member read in %s", (path, start) => {
    expectGuardedServiceRead(section(path, start))
  })

  it("does not send high-risk member columns to round or cancellation clients", () => {
    const roundSubmissions = section(
      "src/lib/queries/rounds.ts",
      "export async function fetchRoundSubmissions",
      "/** 获取某轮次的问卷统计",
    )
    const cancellations = section(
      "src/lib/queries/cancellations.ts",
      "export async function fetchPendingCancellations",
      "export async function fetchCancellationCount",
    )
    for (const text of [roundSubmissions, cancellations]) {
      expect(text).not.toContain("member_number")
      expect(text).not.toContain("user_id")
      expect(text).not.toContain("personality_quiz_results")
    }
  })

  it("keeps matching directory reads guarded and excludes high-risk member fields", () => {
    const matchSession = section(
      "src/lib/queries/matching.ts",
      "export async function fetchMatchSession",
      "export async function fetchMatchCandidates",
    )
    const candidates = section(
      "src/lib/queries/matching.ts",
      "export async function fetchMatchCandidates",
      "// Re-export for backward compatibility",
    )

    expectGuardedServiceRead(matchSession)
    expectGuardedServiceRead(candidates)
    for (const text of [matchSession, candidates]) {
      expect(text).not.toContain("member_number")
      expect(text).not.toContain("user_id")
      expect(text).not.toContain("personality_quiz_results")
    }
  })

  it("uses safe service reads only after page/action administrator guards", () => {
    const blacklistSearch = section(
      "src/app/admin/matching/blacklist/actions.ts",
      "export async function searchMembersForBlacklist",
      "/** 添加黑名单",
    )
    const scriptAccess = section(
      "src/app/admin/scripts/[id]/actions.ts",
      "export async function fetchScriptAccessList",
    )
    expectGuardedServiceRead(blacklistSearch)
    expectGuardedServiceRead(scriptAccess)

    for (const path of [
      "src/app/admin/matching/blacklist/page.tsx",
      "src/app/admin/matching/[id]/page.tsx",
      "src/app/admin/scripts/[id]/page.tsx",
    ]) {
      const text = source(path)
      expect(text.indexOf("await requireAdmin()")).toBeGreaterThanOrEqual(0)
      expect(text.indexOf("createAdminClient()")).toBeGreaterThan(text.indexOf("await requireAdmin()"))
    }

    for (const text of [blacklistSearch, scriptAccess, source("src/app/admin/scripts/[id]/page.tsx")]) {
      expect(text).not.toContain("member_number")
      expect(text).not.toContain("user_id")
      expect(text).not.toContain("personality_quiz_results")
    }
  })

  it("preserves authenticated community RPC context and masks member numbers twice", () => {
    const data = source("src/app/admin/community/data.ts")
    const rpcFactory = section(
      "src/app/admin/community/data.ts",
      "async function communityRpcClient",
      "interface QueryError",
    )
    const listMembers = section(
      "src/app/admin/community/data.ts",
      "export async function fetchCommunityAdminMembers",
      "interface CommunityMemberRpcPayload",
    )
    const getMember = section(
      "src/app/admin/community/data.ts",
      "export async function fetchCommunityAdminMember",
    )

    expect(rpcFactory).toContain("await createServerClient()")
    expect(rpcFactory).not.toContain("createAdminClient()")
    expect(listMembers).toContain("await requireAdmin()")
    expect(listMembers).toContain("member_number: null")
    expect(getMember).toContain('admin.role === "super_admin" ? data.member.member_number : null')
    expect(data).toContain('admin.role === "super_admin"')
    expect(data).toContain('if (admin.role !== "super_admin")')
  })
})
