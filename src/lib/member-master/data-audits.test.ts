import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const AUDIT_DIRECTORY = join(process.cwd(), "supabase", "audits")

function readAudit(name: string) {
  return readFileSync(join(AUDIT_DIRECTORY, name), "utf8")
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "")
}

describe("user/member migration data audits", () => {
  it.each([
    "user_member_master_preflight.sql",
    "user_member_master_postflight.sql",
  ])("keeps %s transactionally read-only", (name) => {
    const sql = stripSqlComments(readAudit(name))

    expect(sql).toMatch(/\bBEGIN\s*;/i)
    expect(sql).toMatch(/SET\s+TRANSACTION\s+READ\s+ONLY\s*;/i)
    expect(sql).toMatch(/\bROLLBACK\s*;/i)
    expect(sql).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+[\w".]+\s+SET|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|GRANT|REVOKE)\b/i,
    )
  })

  it("reports every population and identity-link boundary before migration", () => {
    const sql = readAudit("user_member_master_preflight.sql")

    expect(sql).toContain("auth_without_member")
    expect(sql).toContain("member_without_auth_link")
    expect(sql).toContain("unbound_member_auth_email_candidate")
    expect(sql).toContain("duplicate_normalized_member_email")
    expect(sql).toContain("identity_missing")
    expect(sql).toContain("activity_records.participant_ids[]")
    expect(sql).toContain("review_participant_mismatch")
    expect(sql).toContain("legacy_population")
    expect(sql).toContain("legacy_claimed_by_missing_member")
    expect(sql).toContain("multiple_legacy_records_same_member")
  })

  it("checks lifecycle, duplicate queue, audit and grants after migration", () => {
    const sql = readAudit("user_member_master_postflight.sql")

    expect(sql).toContain("auth_without_member_or_tombstone")
    expect(sql).toContain("invalid_member_state")
    expect(sql).toContain("tombstone_still_linked_to_member")
    expect(sql).toContain("member_duplicate_candidates")
    expect(sql).toContain("candidate_source")
    expect(sql).not.toContain("reason_code")
    expect(sql).toContain("member_role_assignments")
    expect(sql).toContain("member_profile_audit_log")
    expect(sql).toContain("append_only_trigger_missing")
    expect(sql).toContain("invalid_audit_actor_role_snapshot")
    expect(sql).toContain("staff_avatar_cleanup_bucket_missing")
    expect(sql).toContain("legacy_without_canonical_member")
    expect(sql).toContain("orphaned_legacy_shell")
    expect(sql).toContain("anonymized_residual_")
    expect(sql).toContain("operational_reason_guard_missing")
    for (const table of [
      "match_round_submissions",
      "player_feedback",
      "script_play_records",
      "staff_profiles",
      "unmatched_diagnostics",
      "legacy_members",
    ]) {
      expect(sql).toContain(`'public.${table}'::regclass`)
    }
    expect(sql).toContain("round_submission_policy_invalid")
    expect(sql).toContain("staff_public_acl_invalid")
    expect(sql).toContain("admin_user_audit_append_only_missing")
    expect(sql).toContain("subjectless_operational_audit_invalid")
    expect(sql).toContain("legacy_mutation_boundary_invalid")
    expect(sql).toContain("subjectless_operational_audit_log")
    expect(sql).toContain("published_staff_profiles")
    expect(sql).toContain("information_schema.role_routine_grants")
    expect(sql).toContain("admin_complete_member_auth_delete")
    expect(sql).toContain("service_set_member_line_identity")
    expect(sql).toContain("admin_record_member_import_event")
    expect(sql).toContain("admin_upsert_legacy_member")
    expect(sql).toContain("admin_delete_operational_record")
    expect(sql).toContain("auth_can_call_legacy_raw_audit_rpc")
    expect(sql).toContain("pg_policies")
    expect(sql).toContain("has_function_privilege")
  })
})
