import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const communityUploadRoute = readFileSync(
  join(process.cwd(), "src/app/api/community/uploads/route.ts"),
  "utf8",
)
const profileAvatarRoute = readFileSync(
  join(process.cwd(), "src/app/api/profile/avatar/route.ts"),
  "utf8",
)
const mediaRoute = readFileSync(
  join(process.cwd(), "src/app/api/community/media/route.ts"),
  "utf8",
)
const storageMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260809094500_community_storage_route_only_writes.sql",
  ),
  "utf8",
)

describe("community Storage write contract", () => {
  it.each([
    ["community upload", communityUploadRoute],
    ["profile avatar", profileAvatarRoute],
  ])("uses the service client for %s objects", (_name, source) => {
    expect(source).toContain("const admin = createAdminClient()")
    expect(source).toContain("admin.storage")
    expect(source).not.toContain("supabase.storage")
  })

  it("removes permissive member writes and denies later policy bypasses", () => {
    for (const operation of ["insert", "update", "delete"]) {
      expect(storageMigration).toContain(
        `DROP POLICY IF EXISTS community_storage_${operation} ON storage.objects`,
      )
      expect(storageMigration).toContain(
        `CREATE POLICY community_storage_route_only_${operation}`,
      )
    }

    expect(storageMigration.match(/AS RESTRICTIVE/g)).toHaveLength(3)
    expect(storageMigration.match(/bucket_id NOT IN \('community-avatars', 'community-media'\)/g)).toHaveLength(4)
    expect(storageMigration).not.toContain("DROP POLICY IF EXISTS community_storage_read")
  })

  it("lets only the owner preview a registered photo before publication", () => {
    expect(mediaRoute).toContain('.schema("private")')
    expect(mediaRoute).toContain('.from("community_processed_uploads")')
    expect(mediaRoute).toContain('.eq("member_id", player.memberId)')
    expect(mediaRoute).toContain('.eq("bucket_id", COMMUNITY_MEDIA_BUCKET)')
    expect(mediaRoute).toContain("const isOwnPendingPhoto")
    expect(mediaRoute).toContain("if (!admin && !isOwnPendingPhoto)")
  })
})
