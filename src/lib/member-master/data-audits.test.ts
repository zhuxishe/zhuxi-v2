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

function expectedRelationValues(sql: string) {
  const block = /WITH expected_relation\(qualified_name\) AS \(\s*VALUES([\s\S]*?)\n\s*\)\s*\n\s*SELECT count\(\*\)/i.exec(
    stripSqlComments(sql),
  )
  expect(block, "expected_relation VALUES block must exist").not.toBeNull()
  return [...(block?.[1] ?? "").matchAll(/\('([^']+)'\)/g)]
    .map((match) => match[1])
    .sort()
}

describe("user/member migration data audits", () => {
  it.each([
    "user_member_master_preflight.sql",
    "user_member_master_postflight.sql",
    "user_member_master_production_reconciliation.sql",
  ])("keeps %s transactionally read-only", (name) => {
    const sql = stripSqlComments(readAudit(name))

    expect(sql).toMatch(/\bBEGIN\s*;/i)
    expect(sql).toMatch(/SET\s+TRANSACTION\s+READ\s+ONLY\s*;/i)
    expect(sql).toMatch(/\bROLLBACK\s*;/i)
    expect(sql).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE\s+[\w".]+\s+SET|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|GRANT|REVOKE)\b/i,
    )
  })

  it("keeps the Production reconciliation report aggregate-only", () => {
    const sql = stripSqlComments(
      readAudit("user_member_master_production_reconciliation.sql"),
    )

    expect(sql).toContain("projected_member_rows_after_v1")
    expect(sql).toContain("match_round_import_metadata_column_valid")
    expect(sql).toContain("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
    expect(sql).toContain("community_storage_route_only_insert")
    expect(sql).toContain("safely_convertible_stringified_arrays")
    expect(sql).toContain("legacy_rows_matching_existing_identity_name_school")
    expect(sql).toContain("qual, with_check")
    expect(sql).not.toMatch(
      /\bSELECT\s+\*\s+FROM\s+(?:public|private|auth)\./i,
    )
    expect(sql).not.toMatch(/\bRETURNING\b/i)
    expect(sql).not.toMatch(/SELECT[\s\S]{0,120}\b(?:email|full_name|phone|id)\b\s*(?:,|FROM)/i)
  })

  it("checks the exact 46 release relations and every migrated member reference shape", () => {
    const sql = readAudit("user_member_master_production_reconciliation.sql")
    const relations = expectedRelationValues(sql)

    expect(relations).toHaveLength(46)
    for (const relation of [
      "auth.users",
      "private.community_comment_authors",
      "private.community_post_authors",
      "private.community_processed_uploads",
      "public.admin_users",
      "public.community_moderation_actions",
      "public.community_nickname_history",
      "public.community_post_images",
      "public.community_reports",
      "public.community_sanctions",
      "public.past_event_reviews",
      "public.player_activity_settings",
      "storage.objects",
    ]) {
      expect(relations).toContain(relation)
    }

    for (const routine of [
      "private.community_storage_object_referenced(text,text)",
      "private.profile_admin_metrics_payload(uuid)",
      "private.profile_current_admin_id()",
      "private.profile_normalize_nickname(text)",
      "private.recalculate_member_activity_stats(uuid)",
      "public.admin_get_member_profile_audit(uuid,integer)",
      "public.admin_get_member_profile_metrics(uuid)",
      "public.admin_update_member_number(uuid,text,text)",
      "public.is_admin()",
      "public.my_email()",
    ]) {
      expect(sql).toContain(`('${routine}')`)
    }
    expect(sql).toContain("expected_routines")
    expect(sql).toContain("present_routines")
    expect(sql).toContain("member_profile_audit_sequence_present")
    expect(sql).toContain("member_profile_audit_sequence_bound")
    expect(sql).toContain("member_profile_audit_id_identity_valid")
    expect(sql).toContain("member_profile_audit_id_unique")
    expect(sql).toContain("expected_triggers")
    expect(sql).toContain("valid_triggers")
    expect(sql).toContain("missing_or_mismatched_triggers")
    expect(sql).toContain("expected_unique_arbiters")
    expect(sql).toContain("valid_unique_arbiters")
    expect(sql).toContain("missing_or_mismatched_unique_arbiters")
    expect(sql).toContain("trigger_info.tgenabled IN ('O', 'A')")
    expect(sql).toContain("trigger_info.tgtype::integer = expected.trigger_type")
    expect(sql).toContain("index_info.indpred IS NULL")
    expect(sql).toContain("index_info.indexprs IS NULL")

    for (const source of [
      "private.community_comment_authors",
      "private.community_post_authors",
      "private.community_profile_members",
      "private.member_profile_audit_log",
      "private.member_profile_metrics",
      "public.match_results.group_members",
      "public.activity_records.participant_ids",
      "public.activity_records.late_member_ids",
      "public.activity_records.no_show_member_ids",
      "public.match_round_submissions",
      "public.player_feedback",
      "public.script_play_records",
      "public.unmatched_diagnostics",
    ]) {
      expect(sql).toContain(`'${source}'`)
    }
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
