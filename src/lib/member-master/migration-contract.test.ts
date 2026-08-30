import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260829175645_user_member_master_v1.sql",
  ),
  "utf8",
)

const identityBootstrapMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260830162310_admin_create_missing_member_identity.sql",
  ),
  "utf8",
)

const restoreAndQuizMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260830163614_fix_member_restore_and_quiz_answers.sql",
  ),
  "utf8",
)

const matchingAclMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260830165712_restore_matching_table_acl.sql",
  ),
  "utf8",
)

const operationalAuditTriggerFixMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260830174115_fix_operational_audit_trigger_record_scope.sql",
  ),
  "utf8",
)

function functionBody(name: string) {
  const match = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\b`,
    "i",
  ).exec(migration)
  const start = match?.index ?? -1
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0)
  const remainder = migration.slice(start + 1)
  const nextMatch = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/i.exec(remainder)
  const next = nextMatch ? start + 1 + nextMatch.index : -1
  return migration.slice(start, next === -1 ? migration.length : next)
}

describe("user/member master migration contract", () => {
  it("lets an administrator create the first identity row only with onboarding-required fields", () => {
    expect(identityBootstrapMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_update_member_section")
    expect(identityBootstrapMigration).toContain("MEMBER_MASTER_IDENTITY_REQUIRED_FIELDS_MISSING")
    for (const field of ["full_name", "gender", "age_range", "nationality", "current_city"]) {
      expect(identityBootstrapMigration).toContain(`p_payload->>'${field}'`)
    }
    expect(identityBootstrapMigration).toMatch(
      /v_before := private\.member_master_section_snapshot[\s\S]*INSERT INTO public\.member_identity[\s\S]*private\.member_master_apply_admin_section/,
    )
    expect(identityBootstrapMigration).toMatch(/ON CONFLICT \(member_id\) DO NOTHING/)
    expect(identityBootstrapMigration).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/)
  })

  it("rejects empty or no-op restores and canonicalizes quiz answers as arrays", () => {
    expect(restoreAndQuizMigration).toContain("v_source_event.before_values = '{}'::jsonb")
    expect(restoreAndQuizMigration).toContain("MEMBER_MASTER_RESTORE_NO_CHANGES")
    expect(restoreAndQuizMigration).toContain("jsonb_typeof(quiz.answers) = 'string'")
    expect(restoreAndQuizMigration).toContain("personality_quiz_results_answers_array_check")
    expect(restoreAndQuizMigration).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/)
  })

  it("explicitly exposes matching tables to authenticated users behind RLS", () => {
    expect(matchingAclMigration).toContain("public.match_rounds")
    expect(matchingAclMigration).toContain("public.match_sessions")
    expect(matchingAclMigration).toMatch(
      /DROP POLICY IF EXISTS member_master_match_sessions_active_member_read[\s\S]*CREATE POLICY member_master_match_sessions_active_member_read/,
    )
    expect(matchingAclMigration).toMatch(
      /status IN \('confirmed', 'published', 'closed'\)[\s\S]*member\.status = 'approved'[\s\S]*member\.account_status = 'active'/,
    )
    expect(matchingAclMigration).toMatch(
      /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/,
    )
    expect(matchingAclMigration).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON TABLE[\s\S]*TO authenticated/,
    )
    expect(matchingAclMigration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE[\s\S]*TO service_role/,
    )
    expect(matchingAclMigration).toContain(
      "has_table_privilege('authenticated', scoped_table.table_oid, 'DELETE')",
    )
    expect(matchingAclMigration).toContain("relation.relrowsecurity")
    expect(matchingAclMigration).toContain(
      "member_master_match_sessions_active_member_read",
    )
    expect(matchingAclMigration).toContain("MEMBER_MASTER_MATCHING_TABLE_ACL_INVALID")
    expect(matchingAclMigration).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/)
  })

  it("scopes submission-only trigger fields before planning other table records", () => {
    expect(operationalAuditTriggerFixMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.member_master_capture_operational_audit_reason()",
    )
    expect(operationalAuditTriggerFixMigration).toMatch(
      /RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/,
    )
    expect(operationalAuditTriggerFixMigration).toMatch(
      /IF TG_TABLE_NAME = 'match_round_submissions'[\s\S]*AND TG_OP IN \('INSERT', 'UPDATE'\) THEN\s+IF NOT v_is_service[\s\S]*AND NEW\.member_id = private\.profile_current_approved_member_id\(\) THEN/,
    )
    expect(operationalAuditTriggerFixMigration).not.toMatch(
      /AND TG_OP IN \('INSERT', 'UPDATE'\)\s+AND NOT v_is_service/,
    )
    expect(operationalAuditTriggerFixMigration).toMatch(
      /REVOKE ALL ON FUNCTION private\.member_master_capture_operational_audit_reason\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    )
    expect(operationalAuditTriggerFixMigration).toContain(
      "MEMBER_MASTER_OPERATIONAL_TRIGGER_SCOPE_INVALID",
    )
    expect(operationalAuditTriggerFixMigration).toMatch(
      /BEGIN;[\s\S]*COMMIT;\s*$/,
    )
  })

  it("is one explicit atomic migration with a deployment lock", () => {
    expect(migration).toMatch(/^--[\s\S]*?\bBEGIN\s*;/i)
    expect(migration).toContain("pg_advisory_xact_lock")
    expect(migration).toMatch(/\bCOMMIT\s*;\s*$/i)
  })

  it("keeps the three lifecycle axes independent and constrained", () => {
    expect(migration).toContain("members_account_status_check")
    expect(migration).toContain("'unbound', 'active', 'suspended', 'closed'")
    expect(migration).toContain("members_profile_stage_check")
    expect(migration).toContain("'not_started', 'in_progress', 'submitted', 'complete'")
    expect(migration).toContain("members_onboarding_step_check")
    expect(migration).toContain("members_anonymized_state_check")
    expect(migration).not.toMatch(/NEW\.status\s*=\s*'inactive'[\s\S]{0,200}account_status/i)
  })

  it("creates or reuses a canonical row only from auth.uid and never claims by email", () => {
    const ensure = functionBody("ensure_my_member_record")
    expect(ensure).toContain("v_user_id uuid := (SELECT auth.uid())")
    expect(ensure).toContain("WHERE member.user_id = v_user_id")
    expect(ensure).toContain("member_auth_tombstones")
    expect(ensure).not.toMatch(/UPDATE\s+public\.members[\s\S]*WHERE[\s\S]*lower\s*\(\s*btrim\s*\(\s*(?:member\.)?email/i)
    expect(ensure).not.toMatch(/SET\s+user_id\s*=[\s\S]*email/i)
    expect(ensure).toMatch(
      /pg_advisory_xact_lock[\s\S]*member_auth_tombstones[\s\S]*SELECT \* INTO v_member/,
    )
    expect(ensure).toMatch(
      /IF v_member\.id IS NULL THEN[\s\S]*member_auth_tombstones[\s\S]*SELECT lower\(btrim\(auth_user\.email\)\)/,
    )
  })

  it("saves each onboarding step through a narrow validated RPC", () => {
    const save = functionBody("save_my_onboarding_step")
    const submit = functionBody("submit_my_onboarding")
    expect(save).toContain("MEMBER_MASTER_STEP_OUT_OF_ORDER")
    expect(save).toContain("MEMBER_MASTER_ACCOUNT_BLOCKED")
    expect(save).toContain("onboarding_step_saved")
    expect(submit).toContain("MEMBER_MASTER_REQUIRED_FIELDS_MISSING")
    expect(submit).toContain("onboarding_submitted")
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.save_my_onboarding_step(smallint, jsonb) TO authenticated",
    )
  })

  it("paginates the database directory and gates high-risk search fields", () => {
    const directory = functionBody("admin_list_member_directory")
    expect(directory).toContain("p_page_size NOT BETWEEN 1 AND 100")
    expect(directory).toContain("OFFSET (p_page - 1) * p_page_size")
    expect(directory).toContain("'total_pages'")
    expect(directory).toMatch(/v_can_read_high_risk[\s\S]*member\.member_number/)
    expect(directory).toMatch(/v_can_read_high_risk[\s\S]*auth_user\.email/)
    expect(directory).toContain("'redacted_fields'")
    expect(directory).toContain("legacy_rollup.record_count")
    expect(directory).toContain("legacy_search.full_name")
    expect(directory).toMatch(/v_can_read_high_risk[\s\S]*legacy_search\.member_no/)
  })

  it("redacts high-risk account/quiz values, role actor IDs and erased PII in the database response", () => {
    const detail = functionBody("admin_get_member_360")
    const audit = functionBody("admin_list_member_audit")
    expect(detail).toContain("'quiz.answers'")
    expect(detail).toContain("'duplicate_candidates'")
    expect(detail).toContain("'roles', CASE WHEN v_is_super OR v_is_service")
    expect(detail).toContain("WHEN event.section = 'roles'")
    expect(detail).toContain("ARRAY['metadata', 'actor_user_id', 'actor_admin_id']")
    expect(detail).toContain("'role_key', assignment.role_key")
    expect(detail).toContain("'legacy_records'")
    expect(detail).toContain("'staff_profiles'")
    expect(detail).toContain("'match_round_submissions'")
    expect(detail).toContain("'script_play_records'")
    expect(detail).toContain("'unmatched_diagnostics'")
    expect(detail).toContain("'match_round_submissions.raw_payload'")
    expect(detail).toMatch(
      /match_round_submissions[\s\S]*ELSE jsonb_build_object\([\s\S]*'redacted', true/,
    )
    expect(detail).toMatch(/v_member\.anonymized_at\s+IS\s+NOT\s+NULL[\s\S]*values_redacted/i)
    expect(audit).toContain("p_page_size")
    expect(audit).toContain("actor_user_id")
    expect(audit).toMatch(/anonymized_at[\s\S]*values_redacted/i)
  })

  it("makes audit rows append-only while retaining subject snapshots", () => {
    expect(migration).toContain("member_id_snapshot")
    expect(migration).toContain("member_master_reject_audit_mutation")
    expect(migration).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+private\.member_profile_audit_log/i)
    expect(migration).toContain("MEMBER_MASTER_AUDIT_APPEND_ONLY")
    expect(migration).toContain("restored_from_event_id")
    expect(migration).toContain("service_identity_link")
    expect(migration).toContain("line_self_service")
    expect(migration).toContain("auth_delete_completed")
    expect(migration).toContain("actor_role_snapshot")
    expect(migration).toContain("NEW.actor_role_snapshot := CASE")
  })

  it("uses tombstones for privacy deletion and blocks restoration afterward", () => {
    const anonymize = functionBody("admin_anonymize_member")
    const restore = functionBody("admin_restore_member_event")
    const complete = functionBody("admin_complete_member_auth_delete")
    expect(anonymize).toContain("private.member_auth_tombstones")
    expect(anonymize).toContain(
      "hashtextextended('member:' || v_lock_user_id::text, 0)",
    )
    expect(anonymize).toMatch(/user_id\s*=\s*NULL/)
    expect(anonymize).toContain("community_nickname_history")
    expect(anonymize).toContain("avatar_path = NULL")
    expect(anonymize).toContain("UPDATE public.legacy_members")
    expect(anonymize).toContain("UPDATE public.match_round_submissions")
    expect(anonymize).toContain("UPDATE public.member_notes SET note = '[anonymized]'")
    expect(anonymize).toContain("UPDATE public.player_feedback SET")
    expect(anonymize).toContain("UPDATE private.community_post_authors")
    expect(anonymize).toContain("UPDATE private.community_comment_authors")
    expect(migration).toContain("community_media_cleanup_queue_bucket_id_check")
    expect(migration).toContain("'community-avatars', 'community-media', 'staff-avatars'")
    expect(anonymize).toContain("'staff-avatars'")
    expect(anonymize).toContain("is_published = false")
    expect(anonymize).toContain("UPDATE public.match_round_submissions SET")
    expect(anonymize).toContain("UPDATE public.script_play_records SET")
    expect(anonymize).toContain("UPDATE public.unmatched_diagnostics SET")
    expect(anonymize).toContain("cancellation_reason = NULL")
    expect(anonymize).toContain("feedback_a = CASE")
    expect(anonymize).toContain("UPDATE public.activity_records AS activity SET notes = NULL")
    expect(anonymize).toContain("UPDATE public.legacy_members AS legacy SET")
    expect(restore).toContain("MEMBER_MASTER_ANONYMIZED_RESTORE_BLOCKED")
    expect(complete).toContain("MEMBER_MASTER_AUTH_USER_STILL_EXISTS")
    expect(complete).toContain("auth_delete_completed_at")
    expect(migration).toContain(
      "'community-avatars', 'community-media', 'staff-avatars'",
    )
    expect(migration).toContain(
      "MEMBER_MASTER_STAFF_AVATAR_CLEANUP_BUCKET_MISSING",
    )
  })

  it("requires an exact pending report and authenticated super-admin to reveal anonymity", () => {
    for (const name of ["community_reveal_post_author", "community_reveal_comment_author"]) {
      const reveal = functionBody(name)
      expect(reveal).toContain("private.member_master_is_super_admin()")
      expect(reveal).toContain("p_report_id")
      expect(reveal).toMatch(/report\.id\s*=\s*p_report_id/)
      expect(reveal).toMatch(/report\.status\s+IN\s*\('pending',\s*'in_review'\)/)
      expect(reveal).toContain("p_reason")
    }
  })

  it("keeps direct member mutations RPC-only and removes legacy broad admin policies", () => {
    expect(migration).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.members[\s\S]*FROM\s+PUBLIC,\s*anon,\s*authenticated/i)
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all" ON public.member_dynamic_stats')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all" ON public.activity_records')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all" ON public.mutual_reviews')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all" ON public.member_notes')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all_sessions" ON public.match_sessions')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all_results" ON public.match_results')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all_relationships" ON public.pair_relationships')
    expect(migration).toContain('DROP POLICY IF EXISTS "admin_all_submissions" ON public.match_round_submissions')
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_get_member_profile_audit(uuid, integer)")
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_get_member_profile_metrics(uuid)")
  })

  it("lets each administrator read their own role for login while keeping the directory super-only", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "self_check_by_email" ON public.admin_users')
    expect(migration).toContain('DROP POLICY IF EXISTS "user_read_self" ON public.admin_users')
    expect(migration).toContain('DROP POLICY IF EXISTS "self_bind_by_email" ON public.admin_users')
    expect(migration).toContain("member_master_admin_users_self_or_super_select")
    expect(migration).toMatch(
      /member_master_admin_users_self_or_super_select[\s\S]*user_id\s*=\s*\(SELECT auth\.uid\(\)\)[\s\S]*member_master_is_super_admin/,
    )
    expect(migration).toMatch(
      /member_master_admin_users_super_insert[\s\S]*member_master_is_super_admin/,
    )
    expect(migration).toMatch(
      /member_master_admin_users_super_update[\s\S]*member_master_is_super_admin/,
    )
    expect(migration).toMatch(
      /member_master_admin_users_super_delete[\s\S]*member_master_is_super_admin/,
    )
  })

  it("canonicalizes every legacy row without repointing a later conflicting claim", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS canonical_member_id uuid")
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.member_master_ensure_legacy_canonical()")
    expect(migration).toContain("NEW.canonical_member_id := v_old_canonical_id")
    expect(migration).toContain("'duplicate_candidate_only'")
    expect(migration).toContain("'automatic_merge_performed', false")
    expect(migration).toContain("MEMBER_MASTER_LEGACY_CANONICAL_INCOMPLETE")
    expect(migration).toContain("MEMBER_MASTER_LEGACY_CANONICAL_ORPHAN")
  })

  it("requires human reasons for administrator operational writes without breaking service jobs", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.member_master_capture_operational_audit_reason()")
    expect(migration).toContain("MEMBER_MASTER_OPERATION_REASON_REQUIRED")
    expect(migration).toContain("'Service ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME")
    expect(migration).toContain("NEW.audit_reason := NULL")
    expect(migration).toContain("admin_delete_operational_record")
    expect(migration).toContain("admin_upsert_activity_record")
    expect(migration).toContain("MEMBER_MASTER_OPERATION_REASON_GUARD_MISSING")
    for (const table of [
      "match_round_submissions",
      "player_feedback",
      "script_play_records",
      "staff_profiles",
      "unmatched_diagnostics",
      "legacy_members",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS audit_reason text`)
    }
    expect(migration).toContain("private.member_master_lock_non_anonymized_subjects(v_subjects)")
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.match_round_submissions/)
  })

  it("permanently audits operational rows that have no canonical member subject", () => {
    const related = migration.match(
      /CREATE OR REPLACE FUNCTION private\.member_master_audit_related_record_change[\s\S]*?\$function\$;/,
    )?.[0] ?? ""
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS private.subjectless_operational_audit_log")
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON private\.subjectless_operational_audit_log/,
    )
    expect(migration).toContain(
      "REVOKE ALL ON TABLE private.subjectless_operational_audit_log",
    )
    expect(migration).toContain(
      "GRANT SELECT ON TABLE private.subjectless_operational_audit_log TO service_role",
    )
    expect(migration).toContain(
      "GRANT USAGE ON SCHEMA private TO authenticated, service_role",
    )
    expect(related).toContain("IF NOT EXISTS (")
    expect(related).toContain("v_business_changed_fields")
    expect(related).toContain("field.key !~ '(_id|_ids|_by)$'")
    expect(related).toContain("'id', 'audit_reason', 'created_at', 'updated_at', 'import_metadata'")
    expect(related).toContain("INSERT INTO private.subjectless_operational_audit_log")
    expect(related).toContain("actor_user_id_snapshot")
    expect(related).toContain("actor_role_snapshot")
    expect(related).toMatch(
      /INSERT INTO private\.subjectless_operational_audit_log[\s\S]*?IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;[\s\S]*?RETURN NEW;[\s\S]*?v_changed_fields :=/,
    )
    expect(migration).toContain("MEMBER_MASTER_SUBJECTLESS_AUDIT_INVALID")
  })

  it("attests super-admin member imports while explicitly recording the non-atomic boundary", () => {
    const importAudit = functionBody("admin_record_member_import_event")
    expect(importAudit).toContain("private.member_master_is_super_admin()")
    expect(importAudit).toContain("'create', 'delete', 'restore'")
    expect(importAudit).toContain("'submission_replace'")
    expect(importAudit).toContain("'round_submission_import_snapshot'")
    expect(importAudit).toContain("'related_match_round_submissions'")
    expect(importAudit).toContain("FROM public.match_round_submissions AS submission")
    expect(importAudit).toContain("submission.game_type_pref")
    expect(importAudit).toContain("submission.message")
    expect(importAudit).toContain("v_changed_fields := array_remove(v_requested_changed_fields, 'import_metadata')")
    expect(importAudit).toContain("v_safe_metadata || jsonb_build_object")
    expect(importAudit).not.toContain("p_metadata || jsonb_build_object")
    expect(importAudit).toMatch(
      /\) VALUES \(\s*p_member_id, p_member_id, v_action_type, v_section/,
    )
    expect(importAudit).toContain("'snapshot_present', v_snapshot IS NOT NULL")
    expect(importAudit).toContain("'import_write_atomic_with_audit', false")
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_record_member_import_event(uuid, text, text, jsonb)",
    )
  })

  it("makes active database state authoritative over already-issued sessions", () => {
    expect(migration).toMatch(/member_master_members_admin_or_active_self_read[\s\S]*account_status\s*=\s*'active'/)
    expect(migration).toContain('DROP POLICY IF EXISTS "player_read_own" ON public.members')
    expect(migration).toMatch(/profile_current_approved_member_id[\s\S]*account_status\s*=\s*'active'/)
    expect(migration).toMatch(/community_approved_member_id[\s\S]*account_status\s*=\s*'active'/)
  })

  it("uses a narrow active-participant RPC for player cancellation requests", () => {
    const cancellation = functionBody("request_my_match_cancellation")
    expect(cancellation).toContain("private.profile_current_approved_member_id()")
    expect(cancellation).toContain("MEMBER_MASTER_MATCH_PARTICIPANT_REQUIRED")
    expect(cancellation).toContain("cancellation_requested_by = v_member_id")
    expect(cancellation).toContain("cancellation_status = 'pending'")
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.request_my_match_cancellation(uuid, text)",
    )
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]{0,160}match_results[\s\S]{0,160}FOR UPDATE[\s\S]{0,240}auth\.uid/i)
  })

  it("keeps verified LINE self-bind service-only and audited", () => {
    const line = functionBody("service_set_member_line_identity")
    expect(line).toContain("MEMBER_MASTER_SERVICE_ROLE_REQUIRED")
    expect(line).toContain("WHERE member.user_id = p_user_id")
    expect(line).toContain("MEMBER_MASTER_LINE_IDENTITY_CONFLICT")
    expect(line).toContain("hashtextextended('line:' || v_lock_line_user_id, 0)")
    expect(line).toContain("service_identity_link")
    expect(line).toContain("line_self_service")
    expect(line).not.toMatch(/SET[\s\S]*record_source\s*=/i)
    expect(migration).not.toMatch(
      /NEW\.record_source\s*=\s*'app'[\s\S]{0,160}NEW\.line_user_id[\s\S]{0,160}NEW\.record_source\s*:=\s*'line'/,
    )
  })

  it("maps every legacy source row to one canonical hub without auto-merging a later claim", () => {
    expect(migration).toContain("legacy_members_canonical_member_id_fkey")
    expect(migration).toContain("member_master_ensure_legacy_canonical")
    expect(migration).toMatch(
      /ELSIF v_old_canonical_id IS NOT NULL THEN[\s\S]*NEW\.canonical_member_id := v_old_canonical_id/,
    )
    expect(migration).toContain("'legacy_claim'")
    expect(migration).toContain("'automatic_merge_performed', false")
    expect(migration).toContain("MEMBER_MASTER_LEGACY_CANONICAL_INCOMPLETE")
    expect(migration).toContain("MEMBER_MASTER_LEGACY_CANONICAL_ORPHAN")
    expect(migration).toMatch(
      /member_master_legacy_members_super_read[\s\S]*member_master_is_super_admin/,
    )
  })

  it("requires a transaction-local human reason for operational writes", () => {
    const upsert = functionBody("admin_upsert_activity_record")
    const remove = functionBody("admin_delete_activity_record")
    const genericDelete = functionBody("admin_delete_operational_record")
    const recalculate = functionBody("admin_recalculate_member_activity_stats")
    expect(upsert).toContain("app.member_master_audit_reason")
    expect(upsert).toContain("NOT BETWEEN 4 AND 500")
    expect(upsert).toContain("MEMBER_MASTER_ACTIVITY_ATTENDANCE_INVALID")
    expect(remove).toContain("app.member_master_audit_reason")
    expect(genericDelete).toContain("match_sessions")
    expect(genericDelete).toContain("match_round_submissions")
    expect(genericDelete).toContain("script_play_records")
    expect(genericDelete).toContain("staff_profiles")
    expect(genericDelete).toContain("unmatched_diagnostics")
    expect(genericDelete).toContain("private.member_master_is_super_admin()")
    expect(recalculate).toContain("NOT BETWEEN 4 AND 500")
    expect(recalculate).not.toContain("DEFAULT")
    const recalculateDrop = migration.indexOf(
      "DROP FUNCTION IF EXISTS public.admin_recalculate_member_activity_stats(uuid, text)",
    )
    const recalculateCreate = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.admin_recalculate_member_activity_stats(",
    )
    expect(recalculateDrop).toBeGreaterThanOrEqual(0)
    expect(recalculateDrop).toBeLessThan(recalculateCreate)
    expect(migration).toContain("member_master_capture_operational_audit_reason")
    expect(migration).toContain("member_master_audit_related_change")
    expect(migration).toContain("MEMBER_MASTER_OPERATION_REASON_REQUIRED")
    expect(migration).toContain(
      "'Service ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME",
    )
    expect(migration).toMatch(/\) - 'audit_reason';/)
  })

  it("keeps the legacy profile-metrics mutation narrow and compact", () => {
    const metrics = functionBody("admin_update_member_profile_metrics")
    expect(metrics).toContain("NOT BETWEEN 4 AND 500")
    expect(metrics).toContain("private.member_master_lock_non_anonymized_subjects")
    expect(metrics).toContain("v_before_compact")
    expect(metrics).toContain("v_after_compact")
    expect(metrics).toContain("'metrics_update', 'metrics', v_changed_fields")
    expect(metrics).toContain("jsonb_build_object('compact_snapshot', true)")
    expect(metrics).not.toContain("to_jsonb(v_before)")
    expect(metrics).not.toContain("to_jsonb(v_after)")
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_update_member_profile_metrics(uuid, smallint, numeric, text, text, text, text)",
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_update_member_profile_metrics(uuid, smallint, numeric, text, text, text, text)",
    )
    expect(migration).toContain("MEMBER_MASTER_METRICS_MUTATION_CONTRACT_INVALID")
  })

  it("routes every raw legacy mutation through a super-admin reasoned RPC", () => {
    const legacy = functionBody("admin_upsert_legacy_member")
    const allowedPayload = legacy.match(
      /member_master_validate_payload_keys\([\s\S]*?\n\s*\);/,
    )?.[0] ?? ""
    expect(legacy).toContain("private.member_master_is_super_admin()")
    expect(legacy).toContain("NOT BETWEEN 4 AND 500")
    expect(legacy).toContain("member_master_validate_payload_keys")
    for (const field of [
      "member_no",
      "full_name",
      "interest_tags",
      "match_history",
      "claim_status",
    ]) {
      expect(allowedPayload).toContain(`'${field}'`)
    }
    for (const protectedField of [
      "id",
      "canonical_member_id",
      "claimed_by",
      "reviewed_by",
      "claimed_at",
      "reviewed_at",
      "created_at",
      "audit_reason",
    ]) {
      expect(allowedPayload).not.toContain(`'${protectedField}'`)
    }
    expect(legacy).toContain("MEMBER_MASTER_LEGACY_CLAIM_LINK_REQUIRED")
    expect(legacy).toContain("v_legacy.reviewed_by := v_admin_id")
    expect(legacy).toContain("v_legacy.reviewed_at := now()")
    expect(legacy).toContain("audit_reason = btrim(p_reason)")
    expect(legacy).toContain("'legacy_id', v_legacy.id")
    expect(legacy).toContain("'canonical_member_id', v_legacy.canonical_member_id")
    expect(legacy).toContain("'created', v_created")
    expect(migration).toContain("GRANT SELECT ON TABLE public.legacy_members TO authenticated")
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.legacy_members TO service_role",
    )
    expect(migration).not.toMatch(
      /CREATE POLICY member_master_legacy_members_super_(?:insert|update|delete)/,
    )
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_upsert_legacy_member(uuid, jsonb, text)",
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_upsert_legacy_member(uuid, jsonb, text)",
    )
    expect(migration).toContain("MEMBER_MASTER_LEGACY_MUTATION_BOUNDARY_INVALID")
  })

  it("provides audited note maintenance and super-only raw-stat overrides", () => {
    const note = functionBody("admin_upsert_member_note")
    const stats = functionBody("admin_override_member_dynamic_stats")
    expect(note).toContain("MEMBER_MASTER_ADMIN_REQUIRED")
    expect(note).toContain("audit_reason")
    expect(note).toContain("NOT BETWEEN 4 AND 500")
    expect(stats).toContain("private.member_master_is_super_admin()")
    expect(stats).toContain("member_master_validate_payload_keys")
    expect(stats).toContain("reliability_score NOT BETWEEN 0 AND 5")
    expect(stats).toContain("replay_willing_rate NOT BETWEEN 0 AND 1")
    expect(stats).toContain("audit_reason = EXCLUDED.audit_reason")
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_override_member_dynamic_stats(uuid, jsonb, text)",
    )
  })

  it("keeps community member numbers and import attestation super-admin-only", () => {
    const community = functionBody("community_admin_list_members")
    const importAudit = functionBody("admin_record_member_import_event")
    expect(community).toContain(
      "CASE WHEN v_can_read_high_risk THEN member.member_number ELSE NULL END",
    )
    expect(importAudit).toContain("private.member_master_is_super_admin()")
    expect(importAudit).toContain("'member_import_event'")
    expect(importAudit).toContain("'import_write_atomic_with_audit', false")
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_update_member_number(uuid, text, text)",
    )
    expect(migration).toContain('DROP POLICY IF EXISTS "select_admin_users"')
  })

  it("serializes anonymization against every profile and operational writer", () => {
    const lock = migration.match(
      /CREATE OR REPLACE FUNCTION private\.member_master_lock_non_anonymized_subjects[\s\S]*?\$function\$;/,
    )?.[0] ?? ""
    expect(lock).toContain("FOR KEY SHARE")
    expect(lock).toContain("MEMBER_MASTER_ANONYMIZED_RECORD_LOCKED")
    for (const table of [
      "member_identity",
      "member_language",
      "member_interests",
      "member_personality",
      "member_boundaries",
      "personality_quiz_results",
      "member_verification",
      "legacy_members",
    ]) {
      expect(migration).toMatch(
        new RegExp(`member_master_guard_anonymized_write[\\s\\S]*ON public\\.${table}`),
      )
    }
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION private.member_master_lock_non_anonymized_subjects(uuid[])",
    )
  })

  it("keeps player round submissions narrow while preserving admin-member self service", () => {
    const guard = migration.match(
      /CREATE OR REPLACE FUNCTION private\.member_master_guard_round_submission_write[\s\S]*?\$function\$;/,
    )?.[0] ?? ""
    expect(migration).toContain("member_master_round_submissions_active_self_read")
    expect(migration).toContain("member_master_round_submissions_active_self_insert")
    expect(migration).toContain("member_master_round_submissions_active_self_update")
    expect(migration).not.toMatch(
      /CREATE POLICY member_master_round_submissions_active_self_delete/,
    )
    expect(migration).toContain("now() BETWEEN round.survey_start AND round.survey_end")
    expect(guard).toContain("MEMBER_MASTER_SUBMISSION_SYSTEM_FIELD_IMMUTABLE")
    expect(guard).toContain("round.activity_start AND round.activity_end")
    expect(guard).toContain("count(DISTINCT slot.value)")
    expect(migration).toContain("app.member_master_submission_self_service")
    expect(migration).toContain("Player round submission self-service")
    expect(migration).toMatch(
      /member_master_round_submissions_admin_audited_write[\s\S]*member_master_is_super_admin/,
    )
  })

  it("publishes staff through a safe projection and audits administrator management atomically", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.published_staff_profiles")
    expect(migration).toContain("REVOKE ALL ON TABLE public.staff_profiles FROM PUBLIC, anon, authenticated")
    expect(migration).toContain("GRANT SELECT ON TABLE public.published_staff_profiles TO anon, authenticated, service_role")
    expect(migration).toContain("private.admin_user_audit_log")
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON private\.admin_user_audit_log/)
    for (const rpc of [
      "admin_create_admin_whitelist",
      "admin_update_admin_user_role",
      "admin_delete_admin_user",
    ]) {
      const body = functionBody(rpc)
      expect(body).toContain("private.member_master_is_super_admin()")
      expect(body).toContain("member-master:admin-users")
      expect(body).toContain("private.admin_user_audit_log")
    }
    expect(functionBody("admin_update_admin_user_role")).toContain(
      "MEMBER_MASTER_LAST_SUPER_ADMIN_REQUIRED",
    )
    expect(functionBody("admin_delete_admin_user")).toContain(
      "MEMBER_MASTER_ADMIN_SELF_DELETE_BLOCKED",
    )
  })

  it("provides optimistic feedback processing and atomic diagnostic cleanup", () => {
    const feedback = functionBody("admin_update_player_feedback")
    const diagnostics = functionBody("admin_clear_unmatched_diagnostics")
    expect(feedback).toContain("p_expected_updated_at")
    expect(feedback).toContain("feedback.updated_at = p_expected_updated_at")
    expect(feedback).toContain("MEMBER_MASTER_FEEDBACK_CONCURRENT_MODIFICATION")
    expect(diagnostics).toContain("app.member_master_audit_reason")
    expect(diagnostics).toContain("DELETE FROM public.unmatched_diagnostics")
    expect(diagnostics).toContain("'deleted_count', v_deleted_count")
  })

  it("keeps legacy profile-metrics callers on compact 4–500 character audits", () => {
    const metrics = functionBody("admin_update_member_profile_metrics")
    expect(metrics).toContain("NOT BETWEEN 4 AND 500")
    expect(metrics).toContain("v_before_compact")
    expect(metrics).toContain("v_after_compact")
    expect(metrics).toContain("v_changed_fields")
    expect(metrics).toContain("'compact_snapshot', true")
    expect(metrics).not.toContain("to_jsonb(v_before)")
    expect(metrics).not.toContain("to_jsonb(v_after)")
  })
})
