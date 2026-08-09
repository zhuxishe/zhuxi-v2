import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const pages = [
  "src/app/app/profile/page.tsx",
  "src/app/app/profile/edit/page.tsx",
]

describe("profile page authentication contract", () => {
  it.each(pages)("authenticates before calling the profile RPC in %s", (page) => {
    const source = readFileSync(join(process.cwd(), page), "utf8")
    const authCall = source.indexOf("await requirePlayer()")
    const profileCall = source.indexOf("fetchMyProfileSummary()")

    expect(source).toContain('import { requirePlayer } from "@/lib/auth/player"')
    expect(authCall).toBeGreaterThanOrEqual(0)
    expect(profileCall).toBeGreaterThan(authCall)
  })
})
