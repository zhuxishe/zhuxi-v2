-- One-time administrator-authorized exchange of two display numbers. UUIDs, accounts,
-- business relations and user notifications stay unchanged. Keep every audit.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.members IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.member_identity IN SHARE MODE;
SELECT pg_advisory_xact_lock(hashtextextended('membership_number_allocation', 0));

DO $swap$
DECLARE
  v_person public.members%ROWTYPE;
  v_test public.members%ROWTYPE;
  v_expected_members jsonb;
  v_triggers jsonb;
  v_dependencies jsonb := '{}'::jsonb;
  v_relation record;
  v_hash text;
  v_audit_before bigint;
  v_audit_hash text;
  v_sequence jsonb;
  v_changed integer;
  v_scope constant text := 'member_number_249_250_swap_2026_10_12';
  v_reason constant text := '按管理员请求交换祝安冬与内部测试账号的249/250显示编号；不发送用户通知';
BEGIN
  -- New installations have no such users. Any partial or conflicting evidence
  -- in an existing installation fails closed instead of choosing another user.
  IF NOT EXISTS (SELECT 1 FROM public.member_identity WHERE full_name IN ('祝安冬', '测试专用·'))
     AND NOT EXISTS (SELECT 1 FROM public.members WHERE member_number IN ('ZXS_249', 'ZXS_250')) THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
      WHERE m.record_scope='current' AND i.full_name='祝安冬') <> 1
     OR (SELECT count(*) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
         WHERE m.record_scope='current' AND i.full_name='测试专用·') <> 1 THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_IDENTITY_MISMATCH';
  END IF;
  SELECT m.* INTO STRICT v_person FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
    WHERE m.record_scope='current' AND i.full_name='祝安冬';
  SELECT m.* INTO STRICT v_test FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
    WHERE m.record_scope='current' AND i.full_name='测试专用·';
  -- These are existing, reviewed production identities, never newly generated
  -- IDs. Names alone must not authorize a recreated or duplicate account.
  IF v_person.id IS DISTINCT FROM '627b6d93-b5f0-4cb6-82c8-4f9e76b2225a'::uuid
     OR v_test.id IS DISTINCT FROM '9fc90347-548d-4999-b75a-d40c15e43716'::uuid THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_IDENTITY_MISMATCH';
  END IF;
  IF v_person.id=v_test.id
     OR v_person.record_source <> 'app' OR v_test.record_source <> 'app'
     OR v_person.status <> 'approved' OR v_test.status <> 'approved'
     OR v_person.account_status <> 'active' OR v_test.account_status <> 'active'
     OR v_person.user_id IS NULL OR v_test.user_id IS NULL
     OR v_person.anonymized_at IS NOT NULL OR v_test.anonymized_at IS NOT NULL
     OR v_person.profile_stage <> 'complete' OR v_test.profile_stage <> 'complete'
     OR v_person.onboarding_step <> 4 OR v_test.onboarding_step <> 4
     OR v_person.submitted_at IS NULL OR v_test.submitted_at IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_LIFECYCLE_MISMATCH';
  END IF;
  IF v_person.member_number='ZXS_249' AND v_test.member_number='ZXS_250'
     AND (SELECT count(*)=2 AND count(DISTINCT a.member_id_snapshot)=2 FROM private.member_profile_audit_log a
          WHERE a.metadata->>'correction_scope'=v_scope
            AND a.metadata->>'member_number_event'='pair_swap'
            AND ((a.member_id_snapshot=v_person.id AND a.before_values->>'member_number'='ZXS_250'
                  AND a.after_values->>'member_number'='ZXS_249')
              OR (a.member_id_snapshot=v_test.id AND a.before_values->>'member_number'='ZXS_249'
                  AND a.after_values->>'member_number'='ZXS_250'))) THEN
    RETURN;
  END IF;
  IF v_person.member_number IS DISTINCT FROM 'ZXS_250'
     OR v_test.member_number IS DISTINCT FROM 'ZXS_249' THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_NUMBER_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id NOT IN (v_person.id,v_test.id)
      AND CASE WHEN upper(btrim(m.member_number)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(m.member_number)) FROM 5),'0')) <= 18
        THEN private.member_number_canonical(m.member_number) END IN ('ZXS_249','ZXS_250')
  ) OR EXISTS (
    SELECT 1 FROM private.member_profile_audit_log a
    CROSS JOIN LATERAL (VALUES (a.before_values->>'member_number'),
      (a.after_values->>'member_number'),(a.metadata->>'member_number')) AS n(value)
    WHERE (a.member_id_snapshot IS NULL OR a.member_id_snapshot NOT IN (v_person.id,v_test.id))
      AND CASE WHEN upper(btrim(n.value)) ~ '^ZXS_[0-9]{3,}$'
        AND char_length(ltrim(substring(upper(btrim(n.value)) FROM 5),'0')) <= 18
        THEN private.member_number_canonical(n.value) END IN ('ZXS_249','ZXS_250')
  ) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_THIRD_PARTY_CLAIM';
  END IF;
  IF EXISTS (SELECT 1 FROM public.legacy_members WHERE canonical_member_id IN (v_person.id,v_test.id)) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_LEGACY_LINK';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE (schemaname='public' AND tablename='members')
                OR (schemaname='private' AND tablename='member_profile_audit_log')) THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_REALTIME_PUBLICATION';
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
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_TRIGGER_MISMATCH';
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
  ) THEN RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_TRIGGER_MISMATCH'; END IF;

  SELECT jsonb_agg(CASE WHEN m.id=v_person.id THEN to_jsonb(m)||jsonb_build_object('member_number','ZXS_249')
    WHEN m.id=v_test.id THEN to_jsonb(m)||jsonb_build_object('member_number','ZXS_250')
    ELSE to_jsonb(m) END ORDER BY m.id) INTO v_expected_members FROM public.members m;
  SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid,'name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname) INTO v_triggers
    FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgrelid IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass);
  SELECT COALESCE(max(id),0),md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),''))
    INTO v_audit_before,v_audit_hash FROM private.member_profile_audit_log a;
  SELECT jsonb_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called)
    INTO v_sequence FROM private.member_number_sequence;

  -- Hash every table with a member FK, plus display/notification/Auth records.
  -- These assertions also catch unexpected synchronous trigger side effects.
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
  -- No runtime bypass is added. The table lock excludes all concurrent writes;
  -- ALTER TRIGGER and all three updates roll back together on any failure.
  -- Preserve updated_at too, so in-flight profile version checks remain valid.
  ALTER TABLE public.members DISABLE TRIGGER member_number_before_write;
  ALTER TABLE public.members DISABLE TRIGGER members_updated_at;
  UPDATE public.members SET member_number=NULL WHERE id=v_test.id AND member_number='ZXS_249';
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_WRITE_MISMATCH'; END IF;
  UPDATE public.members SET member_number='ZXS_249' WHERE id=v_person.id AND member_number='ZXS_250';
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_WRITE_MISMATCH'; END IF;
  UPDATE public.members SET member_number='ZXS_250' WHERE id=v_test.id AND member_number IS NULL;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed <> 1 THEN RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_WRITE_MISMATCH'; END IF;
  ALTER TABLE public.members ENABLE TRIGGER member_number_before_write;
  ALTER TABLE public.members ENABLE TRIGGER members_updated_at;

  INSERT INTO private.member_profile_audit_log (
    member_id,member_id_snapshot,action_type,section,changed_fields,
    before_values,after_values,reason,source,metadata
  ) SELECT m.id,m.id,'member_lifecycle_update','account',ARRAY['member_number']::text[],
      jsonb_build_object('member_number',CASE WHEN m.id=v_person.id THEN 'ZXS_250' ELSE 'ZXS_249' END),
      jsonb_build_object('member_number',m.member_number),v_reason,'migration',
      jsonb_build_object('member_number_event','pair_swap','member_number',m.member_number,
        'correction_scope',v_scope,'counterpart_member_id',CASE WHEN m.id=v_person.id THEN v_test.id ELSE v_person.id END)
    FROM public.members m WHERE m.id IN (v_person.id,v_test.id);

  IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.members m) IS DISTINCT FROM v_expected_members
     OR (SELECT jsonb_build_object('last_value',last_value,'log_cnt',log_cnt,'is_called',is_called)
         FROM private.member_number_sequence) IS DISTINCT FROM v_sequence
     OR (SELECT md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),''))
         FROM private.member_profile_audit_log a WHERE id <= v_audit_before) IS DISTINCT FROM v_audit_hash
     OR (SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid,'name',t.tgname,'enabled',t.tgenabled,
           'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname)
         FROM pg_trigger t WHERE NOT t.tgisinternal
           AND t.tgrelid IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass)) IS DISTINCT FROM v_triggers THEN
    RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_POSTFLIGHT_FAILED';
  END IF;
  FOR v_relation IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE v_dependencies ? c.oid::text
  LOOP
    EXECUTE format('SELECT md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'''' ORDER BY to_jsonb(r)::text),'''')) FROM %I.%I r',
      v_relation.nspname,v_relation.relname) INTO v_hash;
    IF v_hash IS DISTINCT FROM v_dependencies->>v_relation.oid::text THEN
      RAISE EXCEPTION 'MEMBER_NUMBER_SWAP_DEPENDENCY_CHANGED: %.%',v_relation.nspname,v_relation.relname;
    END IF;
  END LOOP;
END;
$swap$;
COMMIT;
