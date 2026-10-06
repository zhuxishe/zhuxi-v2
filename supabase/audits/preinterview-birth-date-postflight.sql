-- Read-only postflight. Does not create test accounts or alter member data.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
DO $audit$
DECLARE
  v_function regprocedure;
  v_role text;
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member_identity'
      AND column_name = 'birth_date' AND data_type = 'date' AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member_identity'
      AND column_name = 'legacy_age_range' AND data_type = 'text' AND is_nullable = 'YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member_identity'
      AND column_name = 'age_range' AND data_type = 'text' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_COLUMN_CONTRACT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.member_identity'::regclass
      AND tgname = 'member_identity_sync_birth_date' AND tgenabled = 'O'
      AND tgfoid = 'private.member_identity_sync_birth_date()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_TRIGGER';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.member_identity'::regclass)
     OR has_table_privilege('anon', 'public.member_identity', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.member_identity', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_TABLE_ACCESS';
  END IF;
  FOREACH v_function IN ARRAY ARRAY[
    'private.member_birth_date_from_payload(jsonb)'::regprocedure,
    'private.member_age_range_for_birth_date(date,date)'::regprocedure,
    'private.member_identity_sync_birth_date()'::regprocedure
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(v_role, v_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_PRIVATE_EXECUTE: % %', v_role, v_function;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'public.save_my_onboarding_step(smallint,jsonb)'::regprocedure,
    'public.submit_my_onboarding()'::regprocedure,
    'public.admin_update_member_section(uuid,text,jsonb,text,timestamptz)'::regprocedure,
    'public.admin_anonymize_member(uuid,text)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('service_role', v_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_RPC_ACL: %', v_function;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef
      AND 'search_path=""' = ANY(proconfig)) THEN
      RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_RPC_SECURITY: %', v_function;
    END IF;
  END LOOP;
  v_definition := pg_get_functiondef('public.save_my_onboarding_step(smallint,jsonb)'::regprocedure);
  IF position('private.member_birth_date_from_payload' IN v_definition) = 0
     OR position('MEMBER_MASTER_ACCOUNT_BLOCKED' IN v_definition) = 0
     OR position('MEMBER_MASTER_ONBOARDING_LOCKED' IN v_definition) = 0
     OR position('MEMBER_MASTER_STEP_OUT_OF_ORDER' IN v_definition) = 0
     OR position($fragment$jsonb_typeof(p_payload->'school_name') IS DISTINCT FROM 'string'$fragment$ IN v_definition) = 0
     OR position($fragment$jsonb_typeof(p_payload->'degree_level') IS DISTINCT FROM 'string'$fragment$ IN v_definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_ONBOARDING_GUARDS';
  END IF;
  v_definition := pg_get_functiondef('public.submit_my_onboarding()'::regprocedure);
  IF position('v_identity.birth_date IS NULL' IN v_definition) = 0
     OR position('v_identity.school_name' IN v_definition) = 0
     OR position('v_identity.degree_level' IN v_definition) = 0
     OR position($fragment$v_member.status = 'pending' AND v_member.profile_stage = 'submitted'$fragment$ IN v_definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_SUBMISSION_GUARDS';
  END IF;
  v_definition := pg_get_functiondef('public.admin_anonymize_member(uuid,text)'::regprocedure);
  IF position('birth_date = NULL' IN v_definition) = 0
     OR position('legacy_age_range = NULL' IN v_definition) = 0
     OR position('MEMBER_MASTER_SUPER_ADMIN_REQUIRED' IN v_definition) = 0
     OR position($fragment$custom_answers = '{}'::jsonb$fragment$ IN v_definition) = 0 THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_ANONYMIZATION';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_identity WHERE birth_date IS NOT NULL AND
      (birth_date < DATE '1900-01-01' OR birth_date > (now() AT TIME ZONE 'Asia/Tokyo')::date)) THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_INVALID_DATES';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_identity i JOIN public.members m ON m.id=i.member_id
      WHERE m.anonymized_at IS NOT NULL AND (i.birth_date IS NOT NULL OR i.legacy_age_range IS NOT NULL)) THEN
    RAISE EXCEPTION 'BIRTH_DATE_POSTFLIGHT_ANONYMIZED_PII';
  END IF;
END;
$audit$;

SELECT 'PASS' AS result,
  count(*) AS identity_count,
  count(*) FILTER (WHERE birth_date IS NOT NULL) AS birthday_count,
  count(*) FILTER (WHERE birth_date IS NULL) AS legacy_without_birthday_count,
  count(*) FILTER (WHERE legacy_age_range IS NOT NULL) AS preserved_legacy_band_count,
  count(*) FILTER (WHERE NULLIF(btrim(age_range), '') IS NOT NULL) AS populated_age_range_count,
  count(*) FILTER (WHERE school_name IS NULL OR NULLIF(btrim(school_name), '') IS NULL) AS legacy_without_school_count,
  count(*) FILTER (WHERE degree_level IS NULL OR NULLIF(btrim(degree_level), '') IS NULL) AS legacy_without_degree_count,
  -- Compare this fingerprint with a preflight using to_jsonb(identity)::text.
  -- It covers all old columns, including timestamps, without returning member PII.
  md5(string_agg(md5((to_jsonb(identity) - ARRAY['birth_date','legacy_age_range'])::text), '' ORDER BY id)) AS original_columns_fingerprint
FROM public.member_identity AS identity;
COMMIT;
