-- The operational audit trigger is shared by tables with different row types.
-- Scope member_id access to match_round_submissions before PL/pgSQL plans it.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

SELECT pg_advisory_xact_lock(hashtextextended('member-master-migration', 0));

CREATE OR REPLACE FUNCTION private.member_master_capture_operational_audit_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_is_admin boolean := private.member_master_current_admin_id() IS NOT NULL;
  v_is_service boolean := COALESCE((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_reason text;
  v_row_reason text;
  v_subjects uuid[] := ARRAY[]::uuid[];
  v_record_id uuid;
BEGIN
  -- Resolve both OLD and NEW subjects before every write and acquire the same
  -- canonical-row lock that anonymization conflicts with. This closes the
  -- old-JWT race where a write passed an MVCC check, waited behind the scrub,
  -- and then reintroduced free text after anonymization committed.
  IF TG_TABLE_NAME IN (
    'member_dynamic_stats', 'member_notes', 'match_round_submissions',
    'player_feedback', 'script_play_records', 'staff_profiles',
    'unmatched_diagnostics'
  ) THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.member_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.member_id];
    ELSE
      v_subjects := array_remove(ARRAY[OLD.member_id, NEW.member_id], NULL);
    END IF;
  ELSIF TG_TABLE_NAME = 'legacy_members' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.canonical_member_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.canonical_member_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.canonical_member_id, NEW.canonical_member_id], NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'mutual_reviews' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.reviewer_id, NEW.reviewee_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.reviewer_id, OLD.reviewee_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[
          OLD.reviewer_id, OLD.reviewee_id,
          NEW.reviewer_id, NEW.reviewee_id
        ],
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'activity_records' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[]);
    ELSE
      v_subjects := COALESCE(OLD.participant_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(OLD.no_show_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.participant_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.late_member_ids, ARRAY[]::uuid[])
        || COALESCE(NEW.no_show_member_ids, ARRAY[]::uuid[]);
    END IF;
  ELSIF TG_TABLE_NAME = 'match_results' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := array_remove(
        ARRAY[NEW.member_a_id, NEW.member_b_id]
          || COALESCE(NEW.group_members, ARRAY[]::uuid[]),
        NULL
      );
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id]
          || COALESCE(OLD.group_members, ARRAY[]::uuid[]),
        NULL
      );
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id, NEW.member_a_id, NEW.member_b_id]
          || COALESCE(OLD.group_members, ARRAY[]::uuid[])
          || COALESCE(NEW.group_members, ARRAY[]::uuid[]),
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'pair_relationships' THEN
    IF TG_OP = 'INSERT' THEN
      v_subjects := ARRAY[NEW.member_a_id, NEW.member_b_id];
    ELSIF TG_OP = 'DELETE' THEN
      v_subjects := ARRAY[OLD.member_a_id, OLD.member_b_id];
    ELSE
      v_subjects := array_remove(
        ARRAY[OLD.member_a_id, OLD.member_b_id, NEW.member_a_id, NEW.member_b_id],
        NULL
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'match_sessions' THEN
    v_record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    SELECT COALESCE(array_agg(DISTINCT participant.member_id), ARRAY[]::uuid[])
    INTO v_subjects
    FROM public.match_results AS match
    CROSS JOIN LATERAL unnest(
      array_remove(
        ARRAY[match.member_a_id, match.member_b_id]
          || COALESCE(match.group_members, ARRAY[]::uuid[]),
        NULL
      )
    ) AS participant(member_id)
    WHERE match.session_id = v_record_id;
  END IF;

  PERFORM private.member_master_lock_non_anonymized_subjects(v_subjects);

  IF COALESCE(current_setting('app.member_master_explicit_audit', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    NEW.audit_reason := NULL;
    RETURN NEW;
  END IF;

  v_row_reason := CASE
    WHEN TG_OP = 'DELETE' THEN NULLIF(btrim(OLD.audit_reason), '')
    ELSE NULLIF(btrim(NEW.audit_reason), '')
  END;
  -- Keep the record-specific field access in a nested statement. PL/pgSQL
  -- resolves trigger-record fields when a statement is planned, so referring
  -- to NEW.member_id in the cross-table condition breaks tables without that
  -- column even when TG_TABLE_NAME is different.
  IF TG_TABLE_NAME = 'match_round_submissions'
     AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NOT v_is_service
       AND (SELECT auth.uid()) IS NOT NULL
       AND v_row_reason IS NULL
       AND NULLIF(btrim(current_setting('app.member_master_audit_reason', true)), '') IS NULL
       AND NEW.member_id = private.profile_current_approved_member_id() THEN
      -- One account may legitimately have both admin and player roles. An
      -- unreasoned write to its own active submission is a player self-service
      -- operation, not an administrator override; the later guard still enforces
      -- the open survey window and immutable technical columns.
      v_is_admin := false;
      v_reason := 'Player round submission self-service';
      PERFORM set_config('app.member_master_submission_self_service', 'on', true);
      PERFORM set_config('app.member_master_audit_reason', v_reason, true);
    END IF;
  END IF;
  IF v_is_admin THEN
    v_reason := COALESCE(
      v_row_reason,
      NULLIF(btrim(current_setting('app.member_master_audit_reason', true)), '')
    );
    IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_REQUIRED';
    END IF;
    PERFORM set_config('app.member_master_audit_reason', v_reason, true);
    IF TG_TABLE_NAME = 'activity_records' THEN
      PERFORM set_config('app.member_master_activity_write', 'on', true);
    END IF;
  ELSIF v_is_service THEN
    v_reason := COALESCE(
      v_row_reason,
      NULLIF(btrim(current_setting('app.member_master_audit_reason', true)), ''),
      'Service ' || TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    );
    IF char_length(v_reason) NOT BETWEEN 4 AND 500 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'MEMBER_MASTER_OPERATION_REASON_INVALID';
    END IF;
    PERFORM set_config('app.member_master_audit_reason', v_reason, true);
    IF TG_TABLE_NAME = 'activity_records' THEN
      PERFORM set_config('app.member_master_activity_write', 'on', true);
    END IF;
  END IF;
  -- The reason is transaction-local evidence, not mutable business data.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.audit_reason := NULL;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.member_master_capture_operational_audit_reason()
  FROM PUBLIC, anon, authenticated, service_role;

DO $do$
DECLARE
  v_definition text := pg_get_functiondef(
    'private.member_master_capture_operational_audit_reason()'::regprocedure
  );
BEGIN
  IF v_definition NOT LIKE
       '%TG_TABLE_NAME = ''match_round_submissions''%TG_OP IN (''INSERT'', ''UPDATE'') THEN%IF NOT v_is_service%'
     OR v_definition LIKE
       '%TG_OP IN (''INSERT'', ''UPDATE'')%AND NOT v_is_service%' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MEMBER_MASTER_OPERATIONAL_TRIGGER_SCOPE_INVALID';
  END IF;
END
$do$;

COMMIT;
