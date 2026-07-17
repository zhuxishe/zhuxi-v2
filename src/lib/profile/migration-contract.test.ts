import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260717133952_player_profile_v1.sql"),
  "utf8",
)
const correctionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260717133953_correct_profile_defaults_and_member_number_admin.sql"),
  "utf8",
)

function functionBody(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION ${escaped}\\([\\s\\S]*?\\n\\$\\$;`))
  expect(match, `missing SQL function ${name}`).not.toBeNull()
  return match?.[0] ?? ""
}

describe("player profile migration contract", () => {
  it("keeps the new metrics independent from interview and review scores", () => {
    expect(migration).not.toContain("attractiveness_score")
    expect(migration).not.toContain("avg_review_score")
    expect(migration).toContain("compatibility_score numeric(2,1) NOT NULL DEFAULT 5.0")
    expect(migration).toContain("compatibility_status text NOT NULL DEFAULT 'published'")
    expect(correctionMigration).toContain("ALTER COLUMN internal_note SET DEFAULT '初始分'")
    expect(correctionMigration).toContain("WHERE internal_note = '初试分'")
    expect(correctionMigration).toContain("AND score_source = 'initial'")
    expect(migration).toContain("published_at timestamptz DEFAULT now()")
  })

  it("keeps member-number changes super-admin-only and audited", () => {
    expect(correctionMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_update_member_number")
    expect(correctionMigration).toContain("administrator.role = 'super_admin'")
    expect(correctionMigration).toContain("ARRAY['member_number']::text[]")
    expect(correctionMigration).toContain("GRANT EXECUTE ON FUNCTION public.admin_update_member_number")
  })

  it("migrates canonical identity before enforcing nickname uniqueness", () => {
    expect(migration.indexOf("WITH community_choice AS")).toBeGreaterThan(-1)
    expect(migration.indexOf("WITH community_choice AS")).toBeLessThan(
      migration.indexOf("member_identity_nickname_normalized_uidx"),
    )
    expect(migration).toContain("SET personal_avatar_path = profile.avatar_path")
    expect(migration).toContain("SET avatar_kind = 'personal'")
    expect(migration).toContain("PROFILE_NICKNAME_TAKEN")
    expect(migration).toContain("normalize(btrim(p_value), NFKC)")
    expect(migration).toContain("private.profile_normalize_nickname(p_nickname)")
    expect(migration).toContain("placeholder_sequence AS")
    expect(migration).toContain("highest_existing + row_number()")
  })

  it("recalculates attendance on every record mutation and excludes no-shows", () => {
    const body = functionBody("private.recalculate_member_activity_stats")
    expect(body).toContain("NOT (p_member_id = ANY(activity.no_show_member_ids))")
    expect(migration).toContain("AFTER INSERT OR UPDATE OR DELETE ON public.activity_records")
    expect(migration).toContain("DROP TRIGGER IF EXISTS on_activity_insert")
    expect(migration).not.toMatch(/ALTER TABLE public\.activity_records[\s\S]{0,200}ADD COLUMN[^;]*status/i)
  })

  it("protects personal avatars and requires processed ownership proof", () => {
    const validation = functionBody("private.profile_validate_identity_fields")
    const references = functionBody("private.community_storage_object_referenced")
    const canRead = functionBody("private.community_can_read_storage_object")
    expect(validation).toContain("split_part(NEW.personal_avatar_path, '/', 1)")
    expect(validation).toContain("private.community_processed_uploads")
    expect(validation).toContain("upload.cleanup_claimed_at IS NULL")
    expect(validation).toContain("FOR UPDATE")
    expect(references).toContain("identity.personal_avatar_path = p_object_path")
    expect(canRead).toContain("p_owner_id = (SELECT auth.uid())::text")
    expect(canRead).toContain("private.profile_current_approved_member_id() IS NOT NULL")
    expect(migration).toContain("personal_avatar_replaced")
    expect(migration).toContain("VALUES ('community-avatars', v_orphaned_avatar_path, 'member_deleted')")
    const queueFallback = functionBody("public.profile_service_queue_avatar_cleanup")
    expect(queueFallback).toContain("service_role")
    expect(queueFallback).toContain("private.community_media_cleanup_queue")
  })

  it("exposes only the narrow approved-member community metrics", () => {
    const body = functionBody("public.get_community_member_profile_metrics")
    expect(body).toContain("private.profile_current_approved_member_id()")
    expect(body).toContain("private.community_interaction_is_blocked(p_profile_id)")
    expect(body).toContain("'school_name'")
    expect(body).toContain("'activity_count'")
    expect(body).not.toContain("'member_id'")
    expect(body).not.toContain("'full_name'")
    expect(body).not.toContain("'email'")
    expect(body).not.toContain("'internal_note'")
  })

  it("uses fixed search paths and least-privilege grants", () => {
    const securityDefiners = migration.match(/SECURITY DEFINER/g) ?? []
    const fixedSearchPaths = migration.match(/SECURITY DEFINER\nSET search_path = ''/g) ?? []
    expect(fixedSearchPaths).toHaveLength(securityDefiners.length)
    expect(migration).toContain("REVOKE ALL ON TABLE private.member_profile_metrics FROM PUBLIC, anon, authenticated")
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.recalculate_member_activity_stats(uuid) FROM PUBLIC, anon, authenticated")
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_my_profile_summary() TO authenticated")
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.profile_service_queue_avatar_cleanup(text, text) TO service_role")
    expect(migration).not.toContain("TO anon;\nGRANT EXECUTE ON FUNCTION public.get_my_profile_summary")
  })
})
