-- Fix comparison only; preserve displayed names, account UUIDs and all audit.
-- The data repair and finite release manifest are restricted to reviewed records.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.members IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.member_identity IN SHARE MODE;
SELECT pg_advisory_xact_lock(hashtextextended('membership_number_allocation',0));

-- Finite administrator-approved recycling pool for this one reconciliation.
-- Historical reservations and the monotonic allocation sequence remain intact.
CREATE OR REPLACE FUNCTION private.member_number_released_manifest()
RETURNS TABLE (
  member_number text, release_member_id uuid,
  original_audit_ids bigint[], restored_number text
)
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  VALUES
    ('ZXS_257', 'a1a1bd49-9248-44c2-b32b-9bcd9c765da4'::uuid, ARRAY[]::bigint[], 'ZXS_125'),
    ('ZXS_258', 'a1a1bd49-9248-44c2-b32b-9bcd9c765da4'::uuid, ARRAY[]::bigint[], 'ZXS_125'),
    ('ZXS_259', '41864dff-e981-493b-9f45-4b78fe73e1be'::uuid, ARRAY[2273,2274]::bigint[], 'ZXS_201'),
    ('ZXS_260', '3edcf451-447d-4eae-8403-5664d497efa1'::uuid, ARRAY[2317,2318]::bigint[], 'ZXS_256'),
    ('ZXS_261', 'a1a1bd49-9248-44c2-b32b-9bcd9c765da4'::uuid, ARRAY[2415,2416]::bigint[], 'ZXS_125');
$function$;

CREATE OR REPLACE FUNCTION private.member_number_is_released(p_number text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_manifest record;
  v_release private.member_profile_audit_log%ROWTYPE;
  v_covered_ids bigint[];
  v_history_hash text;
  v_scope constant text := 'roster_name_whitespace_reconciliation_2026_10_12';
  v_reason constant text := '修复老成员姓名空格或补全姓名造成的编号错配，并按原自动分配顺序前移新成员编号；不发送用户通知';
BEGIN
  -- Constants cap this exception to the reviewed five numbers and original
  -- owners. Neither an arbitrary scope nor a new release can widen the pool.
  SELECT * INTO v_manifest FROM private.member_number_released_manifest() AS manifest
    WHERE manifest.member_number = p_number;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Select the first marker, including a malformed one. Fail closed: a later
  -- forged marker must never replace an earlier consumed or invalid release.
  SELECT audit.* INTO v_release FROM private.member_profile_audit_log AS audit
  WHERE audit.metadata->>'correction_scope' = v_scope
    AND audit.metadata->>'member_number_event' = 'pool_release'
    AND audit.metadata->>'member_number' = p_number
  ORDER BY audit.id LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_release.source IS DISTINCT FROM 'migration'
     OR v_release.action_type IS DISTINCT FROM 'member_lifecycle_update'
     OR v_release.section IS DISTINCT FROM 'account'
     OR v_release.member_id_snapshot IS DISTINCT FROM v_manifest.release_member_id
     OR v_release.reason IS DISTINCT FROM v_reason THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.members AS member
    WHERE CASE WHEN upper(btrim(member.member_number)) ~ '^ZXS_[0-9]{3,}$'
      AND char_length(ltrim(substring(upper(btrim(member.member_number)) FROM 5),'0')) <= 18
      THEN private.member_number_canonical(member.member_number) END = p_number
  ) THEN RETURN false; END IF;

  -- Preserve all history. The exact IDs and full-row hash cover every event
  -- before the release; any subsequent mention consumes it permanently.
  WITH number_history AS (
    SELECT audit.* FROM private.member_profile_audit_log AS audit
    WHERE audit.id <> v_release.id AND EXISTS (
      SELECT 1 FROM (VALUES (audit.before_values->>'member_number'),
        (audit.after_values->>'member_number'), (audit.metadata->>'member_number')) AS number(value)
      WHERE CASE WHEN upper(btrim(number.value)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(number.value)) FROM 5),'0')) <= 18
        THEN private.member_number_canonical(number.value) END = p_number
    )
  )
  SELECT COALESCE(array_agg(history.id ORDER BY history.id), ARRAY[]::bigint[]),
         md5(COALESCE(string_agg(md5(to_jsonb(history)::text),'' ORDER BY history.id),''))
    INTO v_covered_ids, v_history_hash FROM number_history AS history;
  IF v_release.metadata->'approved_audit_ids' IS DISTINCT FROM to_jsonb(v_covered_ids)
     OR v_release.metadata->>'history_hash' IS DISTINCT FROM v_history_hash
     OR EXISTS (SELECT 1 FROM unnest(v_covered_ids) AS covered(id) WHERE covered.id > v_release.id)
  THEN RETURN false; END IF;

  IF cardinality(v_manifest.original_audit_ids) = 0 THEN
    -- 257/258 were never issued; they are not retired numbers. Their finite
    -- release is attached to the actual Huang correction, rather than opening
    -- every unoccupied value below the high-water mark.
    IF cardinality(v_covered_ids) <> 0 THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM private.member_profile_audit_log AS audit
      WHERE audit.id < v_release.id
        AND audit.member_id_snapshot = v_manifest.release_member_id
        AND audit.source = 'migration'
        AND audit.action_type = 'member_lifecycle_update'
        AND audit.section = 'account'
        AND audit.reason = v_reason
        AND audit.metadata->>'correction_scope' = v_scope
        AND audit.before_values->>'member_number' = 'ZXS_261'
        AND audit.after_values->>'member_number' = v_manifest.restored_number
    );
  END IF;

  IF NOT v_manifest.original_audit_ids <@ v_covered_ids THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.member_profile_audit_log AS companion
    JOIN private.member_profile_audit_log AS allocation
      ON allocation.id = v_manifest.original_audit_ids[2]
    WHERE companion.id = v_manifest.original_audit_ids[1]
      AND companion.member_id_snapshot = v_manifest.release_member_id
      AND allocation.member_id_snapshot = v_manifest.release_member_id
      AND companion.source = 'system' AND allocation.source = 'system'
      AND companion.action_type = 'member_lifecycle_update'
      AND allocation.action_type = 'member_lifecycle_update'
      AND companion.section = 'member' AND allocation.section = 'account'
      AND companion.before_values->>'member_number' IS NULL
      AND allocation.before_values->>'member_number' IS NULL
      AND companion.after_values->>'member_number' = p_number
      AND allocation.after_values->>'member_number' = p_number
      AND companion.created_at = allocation.created_at
      AND allocation.metadata->>'member_number' = p_number
      AND allocation.metadata->>'member_number_event' = 'allocated'
      AND allocation.metadata->>'member_number_origin' = 'automatic'
      AND allocation.metadata->>'offline_roster_version' = '2026-10-06'
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM private.member_profile_audit_log AS audit
    WHERE audit.id = ANY(v_covered_ids)
      AND (audit.member_id_snapshot IS DISTINCT FROM v_manifest.release_member_id
        OR (NOT audit.id = ANY(v_manifest.original_audit_ids) AND (
          audit.id < v_manifest.original_audit_ids[2]
          OR audit.source IS DISTINCT FROM 'migration'
          OR audit.action_type IS DISTINCT FROM 'member_lifecycle_update'
          OR audit.reason IS DISTINCT FROM v_reason
          OR audit.before_values->>'member_number' IS DISTINCT FROM p_number
          OR (audit.after_values->>'member_number' IS NOT NULL
              AND audit.after_values->>'member_number' IS DISTINCT FROM v_manifest.restored_number)
          OR NOT (COALESCE(audit.metadata->>'member_number_origin','') = v_scope
            OR COALESCE(audit.metadata->>'correction_scope','') = v_scope
            OR audit.section = 'member')
        )))
  ) THEN RETURN false; END IF;

  -- An exact semantic correction is required in addition to staging/retirement
  -- logs; never infer administrator approval from a generic member update.
  RETURN EXISTS (
    SELECT 1 FROM private.member_profile_audit_log AS audit
    WHERE audit.id = ANY(v_covered_ids)
      AND audit.member_id_snapshot = v_manifest.release_member_id
      AND audit.source = 'migration' AND audit.action_type = 'member_lifecycle_update'
      AND audit.section = 'account' AND audit.reason = v_reason
      AND audit.metadata->>'correction_scope' = v_scope
      AND audit.before_values->>'member_number' = p_number
      AND audit.after_values->>'member_number' = v_manifest.restored_number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_next()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_released text;
  v_last bigint;
  v_called boolean;
  v_high bigint;
  v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));
  SELECT manifest.member_number INTO v_released
  FROM private.member_number_released_manifest() AS manifest
  WHERE private.member_number_is_released(manifest.member_number)
  ORDER BY substring(manifest.member_number FROM 5)::bigint LIMIT 1;
  IF v_released IS NOT NULL THEN RETURN v_released; END IF;

  -- Unchanged monotonic fallback; released allocations never lower or consume
  -- the sequence. Successful member/audit writes consume the pool reservation.
  SELECT last_value, is_called INTO v_last, v_called FROM private.member_number_sequence;
  v_high := greatest(private.member_number_max_issued(), CASE WHEN v_called THEN v_last ELSE v_last - 1 END);
  IF v_high >= 999999999999999999 THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'MEMBER_NUMBER_EXHAUSTED';
  END IF;
  PERFORM setval('private.member_number_sequence'::regclass, v_high, true);
  v_next := nextval('private.member_number_sequence'::regclass);
  RETURN 'ZXS_' || CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;
END;
$function$;

REVOKE ALL ON FUNCTION private.member_number_released_manifest() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_is_released(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.member_number_next() FROM PUBLIC, anon, authenticated, service_role;

-- Comparison key only: ignore half-width U+0020 and full-width U+3000 spaces.
-- Stored names and every other character remain unchanged.
CREATE OR REPLACE FUNCTION private.member_number_name_key(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  SELECT NULLIF(translate(COALESCE(p_name, ''), ' ' || chr(12288), ''), '');
$function$;

REVOKE ALL ON FUNCTION private.member_number_name_key(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.member_number_validate(
  p_member_id uuid, p_number text, p_full_name text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_number text := private.member_number_canonical(p_number);
  v_reserved_name text;
  v_current text;
  v_same_current boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));
  SELECT member.member_number INTO v_current FROM public.members AS member WHERE member.id = p_member_id;
  IF v_current IS NOT NULL THEN
    IF upper(btrim(v_current)) ~ '^ZXS_[0-9]{3,}$' THEN
      IF char_length(ltrim(substring(upper(btrim(v_current)) FROM 5), '0')) <= 18 THEN
        v_same_current := private.member_number_canonical(v_current) = v_number;
      END IF;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.members AS member WHERE member.id <> p_member_id
      AND CASE WHEN upper(btrim(member.member_number)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(member.member_number)) FROM 5), '0')) <= 18
        THEN private.member_number_canonical(member.member_number) END = v_number
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_TAKEN';
  END IF;
  IF v_same_current THEN RETURN v_number; END IF;
  SELECT roster.full_name INTO v_reserved_name FROM private.member_number_roster() AS roster WHERE roster.member_number = v_number;
  IF v_reserved_name IS NOT NULL AND private.member_number_name_key(p_full_name) IS DISTINCT FROM private.member_number_name_key(v_reserved_name) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_RESERVED';
  END IF;
  IF private.member_number_history_contains(v_number) AND NOT private.member_number_is_released(v_number) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_RETIRED';
  END IF;
  RETURN v_number;
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_name text;
  v_number text;
  v_origin text := 'manual';
  v_last bigint;
  v_called boolean;
  v_numeric bigint;
  v_roster_matches integer;
BEGIN
  IF NEW.record_scope <> 'current' OR NEW.record_source IN ('legacy', 'import') THEN RETURN NEW; END IF;
  -- Existing RPCs lock this member row before entering here. Keep that ordering:
  -- member row first, allocation advisory lock second, never lock another member.
  PERFORM pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));
  IF NEW.account_status = 'closed' OR NEW.anonymized_at IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.member_number IS NOT NULL AND NEW.member_number IS DISTINCT FROM OLD.member_number THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MEMBER_NUMBER_ACCOUNT_CLOSED';
    END IF;
    RETURN NEW;
  END IF;
  SELECT identity.full_name INTO v_name FROM public.member_identity AS identity WHERE identity.member_id = NEW.id;
  IF TG_OP = 'UPDATE' AND OLD.member_number IS NOT NULL AND NEW.member_number IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MEMBER_NUMBER_INVALID';
  END IF;
  IF NEW.member_number IS NULL AND private.member_number_name_key(v_name) IS NOT NULL THEN
    SELECT count(*),min(roster.member_number) INTO v_roster_matches,v_number
      FROM private.member_number_roster() AS roster
      WHERE private.member_number_name_key(roster.full_name)=private.member_number_name_key(v_name);
    IF v_roster_matches>1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='MEMBER_NUMBER_ROSTER_AMBIGUOUS';
    END IF;
    IF v_number IS NULL THEN
      v_number := private.member_number_next(); v_origin := 'automatic';
    ELSE
      v_origin := 'offline_roster';
    END IF;
    NEW.member_number := v_number;
  END IF;
  IF NEW.member_number IS NOT NULL THEN
    NEW.member_number := private.member_number_canonical(NEW.member_number);
    IF TG_OP = 'INSERT' OR NEW.member_number IS DISTINCT FROM OLD.member_number THEN
      NEW.member_number := private.member_number_validate(NEW.id, NEW.member_number, v_name);
      v_numeric := substring(NEW.member_number FROM 5)::bigint;
      SELECT last_value, is_called INTO v_last, v_called FROM private.member_number_sequence;
      IF v_numeric > (CASE WHEN v_called THEN v_last ELSE v_last - 1 END) THEN
        PERFORM setval('private.member_number_sequence'::regclass, v_numeric, true);
      END IF;
    END IF;
  END IF;
  PERFORM set_config('app.member_number_origin', v_origin, true);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.member_number_on_identity_saved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
BEGIN
  IF private.member_number_name_key(NEW.full_name) IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_member FROM public.members AS member WHERE member.id = NEW.member_id FOR UPDATE;
  IF v_member.record_scope = 'current' AND v_member.record_source NOT IN ('legacy', 'import')
     AND v_member.account_status NOT IN ('closed', 'suspended') AND v_member.anonymized_at IS NULL
     AND v_member.member_number IS NULL THEN
    UPDATE public.members SET member_number = NULL WHERE id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fixed identities and immutable audit evidence reviewed before this release.
CREATE OR REPLACE FUNCTION private.member_number_name_reconciliation_plan()
RETURNS TABLE(member_id uuid,full_name text,before_number text,after_number text,
  allocation_audit_id bigint,name_audit_id bigint,first_name text,correction_type text)
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  VALUES
    ('a1a1bd49-9248-44c2-b32b-9bcd9c765da4'::uuid,'黄 浩淳','ZXS_261','ZXS_125',2416::bigint,2417::bigint,'黄 浩淳','whitespace'),
    ('41864dff-e981-493b-9f45-4b78fe73e1be'::uuid,'戚 晏瑄','ZXS_259','ZXS_201',2274::bigint,2275::bigint,'戚 晏瑄','whitespace'),
    ('5a30803f-fa7b-445c-8343-a0a81be6063c'::uuid,'叶一达','ZXS_255','ZXS_196',1750::bigint,1751::bigint,'叶','name_completion'),
    ('5b488c7e-b66f-4046-bf42-aed40699d367'::uuid,'程竹涓','ZXS_256','ZXS_255',1967::bigint,1968::bigint,'程竹涓','compaction'),
    ('3edcf451-447d-4eae-8403-5664d497efa1'::uuid,'胡妤欣','ZXS_260','ZXS_256',2318::bigint,2319::bigint,'胡妤欣','compaction');
$function$;
REVOKE ALL ON FUNCTION private.member_number_name_reconciliation_plan() FROM PUBLIC,anon,authenticated,service_role;

DO $reconcile$
DECLARE
  v_plan record;
  v_release record;
  v_release_event private.member_profile_audit_log%ROWTYPE;
  v_expected_members jsonb;
  v_triggers jsonb;
  v_dependencies jsonb := '{}'::jsonb;
  v_relation record;
  v_hash text;
  v_audit_before bigint;
  v_audit_hash text;
  v_sequence jsonb;
  v_ids bigint[];
  v_changed integer;
  v_scope constant text := 'roster_name_whitespace_reconciliation_2026_10_12';
  v_reason constant text := '修复老成员姓名空格或补全姓名造成的编号错配，并按原自动分配顺序前移新成员编号；不发送用户通知';
BEGIN
  IF EXISTS (SELECT 1 FROM private.member_number_roster() r GROUP BY private.member_number_name_key(r.full_name)
             HAVING private.member_number_name_key(r.full_name) IS NULL OR count(*)>1) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_ROSTER_AMBIGUOUS';
  END IF;
  -- Fresh installations receive the comparison fix, but have no reviewed data.
  IF NOT EXISTS (SELECT 1 FROM public.members m JOIN private.member_number_name_reconciliation_plan() p ON p.member_id=m.id) THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM private.member_number_name_reconciliation_plan() p JOIN public.members m ON m.id=p.member_id
      WHERE m.member_number=p.after_number) = 5
     AND (SELECT count(*) FROM private.member_profile_audit_log
          WHERE metadata->>'correction_scope'=v_scope AND metadata->>'member_number_event'='roster_reconciliation')=5
     AND NOT EXISTS (SELECT 1 FROM private.member_number_name_reconciliation_plan() p
       WHERE (SELECT count(*) FROM private.member_profile_audit_log a
         WHERE a.member_id_snapshot=p.member_id AND a.source='migration' AND a.reason=v_reason
           AND a.action_type='member_lifecycle_update' AND a.section='account'
           AND a.before_values->>'member_number'=p.before_number AND a.after_values->>'member_number'=p.after_number
           AND a.metadata->>'member_number'=p.after_number AND a.metadata->>'correction_type'=p.correction_type
           AND a.metadata->>'correction_scope'=v_scope AND a.metadata->>'member_number_event'='roster_reconciliation')<>1) THEN
    -- Validate the original release proof without requiring current availability:
    -- a legitimately consumed release stays consumed when this SQL is replayed.
    FOR v_release IN SELECT * FROM private.member_number_released_manifest() LOOP
      SELECT a.* INTO v_release_event FROM private.member_profile_audit_log a
        WHERE a.metadata->>'correction_scope'=v_scope AND a.metadata->>'member_number_event'='pool_release'
          AND a.metadata->>'member_number'=v_release.member_number ORDER BY a.id LIMIT 1;
      IF NOT FOUND OR v_release_event.member_id_snapshot IS DISTINCT FROM v_release.release_member_id
         OR v_release_event.source IS DISTINCT FROM 'migration' OR v_release_event.reason IS DISTINCT FROM v_reason
         OR v_release_event.action_type IS DISTINCT FROM 'member_lifecycle_update'
         OR v_release_event.section IS DISTINCT FROM 'account' THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_INCOMPLETE_RELEASE_EVIDENCE';
      END IF;
      SELECT COALESCE(array_agg(a.id ORDER BY a.id),'{}'::bigint[]),
        md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY a.id),'')) INTO v_ids,v_hash
      FROM private.member_profile_audit_log a WHERE a.id<v_release_event.id AND EXISTS (
        SELECT 1 FROM (VALUES (a.before_values->>'member_number'),(a.after_values->>'member_number'),
          (a.metadata->>'member_number')) n(value)
        WHERE CASE WHEN upper(btrim(n.value)) ~ '^ZXS_[0-9]{3,}$'
          AND char_length(ltrim(substring(upper(btrim(n.value)) FROM 5),'0'))<=18
          THEN private.member_number_canonical(n.value) END=v_release.member_number);
      IF v_release_event.metadata->'approved_audit_ids' IS DISTINCT FROM to_jsonb(v_ids)
         OR v_release_event.metadata->>'history_hash' IS DISTINCT FROM v_hash
         OR NOT v_release.original_audit_ids <@ v_ids THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_INCOMPLETE_RELEASE_EVIDENCE';
      END IF;
    END LOOP;
    RETURN;
  END IF;
  FOR v_plan IN SELECT * FROM private.member_number_name_reconciliation_plan() LOOP
    IF NOT EXISTS (SELECT 1 FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
        WHERE m.id=v_plan.member_id AND m.member_number=v_plan.before_number AND i.full_name=v_plan.full_name
          AND m.record_scope='current' AND m.record_source='app' AND m.account_status='active'
          AND m.status='approved' AND m.profile_stage='complete' AND m.onboarding_step=4
          AND m.user_id IS NOT NULL AND m.anonymized_at IS NULL AND m.submitted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_IDENTITY_MISMATCH';
    END IF;
    IF EXISTS (SELECT 1 FROM public.legacy_members WHERE canonical_member_id=v_plan.member_id) THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_LEGACY_LINK';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM private.member_profile_audit_log a
        WHERE a.id=v_plan.allocation_audit_id AND a.member_id_snapshot=v_plan.member_id
          AND a.action_type='member_lifecycle_update' AND a.section='account' AND a.source='system'
          AND a.before_values->>'member_number' IS NULL AND a.after_values->>'member_number'=v_plan.before_number
          AND a.metadata->>'member_number'=v_plan.before_number AND a.metadata->>'member_number_event'='allocated'
          AND a.metadata->>'member_number_origin'='automatic')
       OR NOT EXISTS (SELECT 1 FROM private.member_profile_audit_log a
        WHERE a.id=v_plan.allocation_audit_id-1 AND a.member_id_snapshot=v_plan.member_id
          AND a.action_type='member_lifecycle_update' AND a.section='member' AND a.source='system'
          AND a.before_values->>'member_number' IS NULL AND a.after_values->>'member_number'=v_plan.before_number)
       OR NOT EXISTS (SELECT 1 FROM private.member_profile_audit_log a
        WHERE a.id=v_plan.name_audit_id AND a.member_id_snapshot=v_plan.member_id
          AND a.section='onboarding_step_1' AND a.before_values->>'full_name' IS NULL
          AND a.after_values->>'full_name'=v_plan.first_name) THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_EVIDENCE_MISMATCH';
    END IF;
    SELECT array_agg(a.id ORDER BY a.id) INTO v_ids FROM private.member_profile_audit_log a
    WHERE EXISTS (SELECT 1 FROM (VALUES (a.before_values->>'member_number'),(a.after_values->>'member_number'),
      (a.metadata->>'member_number')) n(value)
      WHERE CASE WHEN upper(btrim(n.value)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(n.value)) FROM 5),'0'))<=18
        THEN private.member_number_canonical(n.value) END=v_plan.before_number);
    IF v_ids IS DISTINCT FROM ARRAY[v_plan.allocation_audit_id-1,v_plan.allocation_audit_id]::bigint[] THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_NUMBER_HISTORY_CHANGED';
    END IF;
    IF v_plan.correction_type<>'compaction' THEN
      IF NOT EXISTS (SELECT 1 FROM private.member_number_roster() r WHERE r.member_number=v_plan.after_number
          AND private.member_number_name_key(r.full_name)=private.member_number_name_key(v_plan.full_name))
         OR (SELECT count(*) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
             WHERE m.record_scope='current' AND m.account_status NOT IN ('closed','suspended')
               AND m.anonymized_at IS NULL
               AND private.member_number_name_key(i.full_name)=private.member_number_name_key(v_plan.full_name)) <> 1
         OR private.member_number_history_contains(v_plan.after_number) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_ROSTER_CLAIM_CONFLICT';
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.members m WHERE m.id<>v_plan.member_id
       AND NOT EXISTS (SELECT 1 FROM private.member_number_name_reconciliation_plan() p WHERE p.member_id=m.id)
       AND CASE WHEN upper(btrim(m.member_number)) ~ '^ZXS_[0-9]{3,}$'
          AND char_length(ltrim(substring(upper(btrim(m.member_number)) FROM 5),'0'))<=18
          THEN private.member_number_canonical(m.member_number) END IN (v_plan.before_number,v_plan.after_number)) THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_NUMBER_TAKEN';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM private.member_profile_audit_log WHERE id=2051
      AND member_id_snapshot='5a30803f-fa7b-445c-8343-a0a81be6063c'::uuid
      AND section='identity' AND before_values->>'full_name'='叶' AND after_values->>'full_name'='叶一达') THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_NAME_COMPLETION_EVIDENCE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id='627b6d93-b5f0-4cb6-82c8-4f9e76b2225a'::uuid AND member_number='ZXS_249')
     OR NOT EXISTS (SELECT 1 FROM public.members WHERE id='9fc90347-548d-4999-b75a-d40c15e43716'::uuid AND member_number='ZXS_250') THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_PREVIOUS_SWAP_CHANGED';
  END IF;
  -- A registration that arrived after preflight must be included in a revised
  -- ordering plan, never silently left behind the reclaimed suffix.
  IF EXISTS (SELECT 1 FROM public.members m WHERE m.record_scope='current'
      AND m.account_status='active' AND m.record_source NOT IN ('legacy','import')
      AND m.anonymized_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM private.member_number_name_reconciliation_plan() p WHERE p.member_id=m.id)
      AND CASE WHEN upper(btrim(m.member_number)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(m.member_number)) FROM 5),'0'))<=18
        THEN substring(private.member_number_canonical(m.member_number) FROM 5)::bigint END >=257) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_NEW_REGISTRATION_AFTER_PREFLIGHT';
  END IF;
  FOR v_release IN SELECT * FROM private.member_number_released_manifest() WHERE cardinality(original_audit_ids)=0 LOOP
    IF private.member_number_history_contains(v_release.member_number)
       OR EXISTS (SELECT 1 FROM public.members WHERE CASE WHEN upper(btrim(member_number)) ~ '^ZXS_[0-9]{3,}$'
           AND char_length(ltrim(substring(upper(btrim(member_number)) FROM 5),'0'))<=18
           THEN private.member_number_canonical(member_number) END=v_release.member_number) THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_UNISSUED_NUMBER_CLAIMED';
    END IF;
  END LOOP;

  -- The catalog checks below are the same protections reviewed for the prior
  -- 249/250 swap. All number/master audits remain active during correction.
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE (schemaname='public' AND tablename='members')
                OR (schemaname='private' AND tablename='member_profile_audit_log')) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_REALTIME_PUBLICATION';
  END IF;
  -- The live preflight reviewed these existing triggers. Do not proceed after
  -- a new webhook or other unreviewed member/audit trigger has been installed.
  IF EXISTS (SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal
      AND ((t.tgrelid='public.members'::regclass AND t.tgname NOT IN (
        'community_erase_member_comment_likes','member_master_audit_member_change',
        'member_master_guard_anonymized_mutation','member_master_sync_lifecycle',
        'member_master_sync_member_roles','member_number_audit_change','member_number_before_write',
        'members_seed_profile_metrics','members_updated_at','peer_scrub_anonymized_member',
        'player_profile_require_submission_before_approval'))
        OR (t.tgrelid='private.member_profile_audit_log'::regclass AND t.tgfoid NOT IN (
          'private.member_master_prepare_audit_event()'::regprocedure,
          'private.member_master_reject_audit_mutation()'::regprocedure))))
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.members'::regclass
         AND tgname IN ('member_number_before_write','members_updated_at',
                       'member_master_audit_member_change','member_number_audit_change')
         AND tgenabled='O') <> 4
     OR (SELECT count(DISTINCT tgfoid) FROM pg_trigger
         WHERE tgrelid='private.member_profile_audit_log'::regclass AND NOT tgisinternal
           AND tgfoid IN ('private.member_master_prepare_audit_event()'::regprocedure,
                         'private.member_master_reject_audit_mutation()'::regprocedure)
           AND tgenabled='O') <> 2 THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_TRIGGER_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN (VALUES
      ('community_erase_member_comment_likes','private','community_erase_member_comment_likes'),
      ('member_master_audit_member_change','private','member_master_audit_member_change'),
      ('member_master_guard_anonymized_mutation','private','member_master_guard_anonymized_member_mutation'),
      ('member_master_sync_lifecycle','private','member_master_sync_lifecycle'),
      ('member_master_sync_member_roles','private','member_master_sync_member_roles'),
      ('member_number_audit_change','private','member_number_audit_change'),
      ('member_number_before_write','private','member_number_before_write'),
      ('members_seed_profile_metrics','private','profile_seed_member_metrics'),
      ('members_updated_at','public','update_updated_at'),
      ('peer_scrub_anonymized_member','private','peer_scrub_anonymized_member'),
      ('player_profile_require_submission_before_approval','private','player_profile_require_submission_before_approval')
    ) expected(trigger_name,function_schema,function_name) ON expected.trigger_name=t.tgname
    WHERE t.tgrelid='public.members'::regclass AND NOT t.tgisinternal
      AND (n.nspname<>expected.function_schema OR p.proname<>expected.function_name)
  ) THEN RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_TRIGGER_MISMATCH'; END IF;



  SELECT jsonb_agg(CASE WHEN p.member_id IS NULL THEN to_jsonb(m)
    ELSE to_jsonb(m)||jsonb_build_object('member_number',p.after_number) END ORDER BY m.id)
    INTO v_expected_members FROM public.members m LEFT JOIN private.member_number_name_reconciliation_plan() p ON p.member_id=m.id;
  SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid,'name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname) INTO v_triggers
    FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgrelid IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass);
  SELECT COALESCE(max(id),0),md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),''))
    INTO v_audit_before,v_audit_hash FROM private.member_profile_audit_log a;
  SELECT jsonb_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called)
    INTO v_sequence FROM private.member_number_sequence;
  FOR v_relation IN
    SELECT DISTINCT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','private','auth')
      AND c.oid NOT IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass)
      AND (c.oid IN ('public.member_identity'::regclass,'public.legacy_members'::regclass,
                    'public.community_notifications'::regclass,'auth.users'::regclass)
           OR EXISTS (SELECT 1 FROM pg_constraint k WHERE k.contype='f'
                      AND k.conrelid=c.oid AND k.confrelid='public.members'::regclass))
    ORDER BY c.oid
  LOOP
    EXECUTE format('SELECT md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY to_jsonb(r)::text),'''')) FROM %I.%I r',
      v_relation.nspname,v_relation.relname) INTO v_hash;
    v_dependencies := v_dependencies||jsonb_build_object(v_relation.oid::text,v_hash);
  END LOOP;



  PERFORM set_config('app.member_master_audit_source','migration',true);
  PERFORM set_config('app.member_master_audit_reason',v_reason,true);
  PERFORM set_config('app.member_number_origin',v_scope,true);
  ALTER TABLE public.members DISABLE TRIGGER member_number_before_write;
  ALTER TABLE public.members DISABLE TRIGGER members_updated_at;
  UPDATE public.members m SET member_number=NULL FROM private.member_number_name_reconciliation_plan() p
    WHERE m.id=p.member_id AND m.member_number=p.before_number;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed<>5 THEN RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_WRITE_MISMATCH'; END IF;
  UPDATE public.members m SET member_number=p.after_number FROM private.member_number_name_reconciliation_plan() p
    WHERE m.id=p.member_id AND m.member_number IS NULL;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed<>5 THEN RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_WRITE_MISMATCH'; END IF;
  ALTER TABLE public.members ENABLE TRIGGER member_number_before_write;
  ALTER TABLE public.members ENABLE TRIGGER members_updated_at;
  INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,
    before_values,after_values,reason,source,metadata)
    SELECT p.member_id,p.member_id,'member_lifecycle_update','account',ARRAY['member_number']::text[],
      jsonb_build_object('member_number',p.before_number),jsonb_build_object('member_number',p.after_number),v_reason,'migration',
      jsonb_build_object('member_number_event','roster_reconciliation','member_number',p.after_number,
        'correction_scope',v_scope,'correction_type',p.correction_type,'allocation_audit_id',p.allocation_audit_id)
    FROM private.member_number_name_reconciliation_plan() p;

  -- Release only the reviewed finite suffix, after all corrective number logs.
  -- Any future number-bearing audit permanently consumes that release.
  FOR v_release IN SELECT * FROM private.member_number_released_manifest() ORDER BY member_number LOOP
    SELECT COALESCE(array_agg(a.id ORDER BY a.id),'{}'::bigint[]),
      md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY a.id),'')) INTO v_ids,v_hash
    FROM private.member_profile_audit_log a WHERE EXISTS (
      SELECT 1 FROM (VALUES (a.before_values->>'member_number'),(a.after_values->>'member_number'),
        (a.metadata->>'member_number')) n(value)
      WHERE CASE WHEN upper(btrim(n.value)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(n.value)) FROM 5),'0'))<=18
        THEN private.member_number_canonical(n.value) END=v_release.member_number);
    INSERT INTO private.member_profile_audit_log(member_id,member_id_snapshot,action_type,section,changed_fields,
      before_values,after_values,reason,source,metadata) VALUES (
      v_release.release_member_id,v_release.release_member_id,'member_lifecycle_update','account','{}'::text[],
      '{}'::jsonb,'{}'::jsonb,v_reason,'migration',jsonb_build_object('member_number_event','pool_release',
        'member_number',v_release.member_number,'correction_scope',v_scope,
        'approved_audit_ids',to_jsonb(v_ids),'history_hash',v_hash));
    IF NOT private.member_number_is_released(v_release.member_number) THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_RELEASE_INVALID: %',v_release.member_number;
    END IF;
  END LOOP;
  IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.members m) IS DISTINCT FROM v_expected_members
     OR (SELECT jsonb_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called)
         FROM private.member_number_sequence) IS DISTINCT FROM v_sequence
     OR (SELECT md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),''))
         FROM private.member_profile_audit_log a WHERE id <= v_audit_before) IS DISTINCT FROM v_audit_hash
     OR (SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid,'name',t.tgname,'enabled',t.tgenabled,
           'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname)
         FROM pg_trigger t WHERE NOT t.tgisinternal
           AND t.tgrelid IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass)) IS DISTINCT FROM v_triggers THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_POSTFLIGHT_FAILED';
  END IF;
  FOR v_relation IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE v_dependencies ? c.oid::text
  LOOP
    EXECUTE format('SELECT md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY to_jsonb(r)::text),'''')) FROM %I.%I r',
      v_relation.nspname,v_relation.relname) INTO v_hash;
    IF v_hash IS DISTINCT FROM v_dependencies->>v_relation.oid::text THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_RECONCILIATION_DEPENDENCY_CHANGED: %.%',v_relation.nspname,v_relation.relname;
    END IF;
  END LOOP;
END;
$reconcile$;

COMMIT;
