BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'applied_at',(SELECT min(created_at) FROM private.member_profile_audit_log
    WHERE metadata->>'correction_scope'='roster_name_whitespace_reconciliation_2026_10_12'),
  'name_key_checks',private.member_number_name_key(' 黄　 浩淳 ')=private.member_number_name_key('黄浩淳')
    AND private.member_number_name_key('　 ') IS NULL
    AND private.member_number_name_key('向倬维') IS DISTINCT FROM private.member_number_name_key('向倬纬'),
  'targets',(SELECT jsonb_agg(jsonb_build_object('member_id',m.id,'full_name',i.full_name,
    'before',p.before_number,'after',m.member_number,'expected',p.after_number,
    'correct',m.member_number=p.after_number,'other_fields_hash',md5((to_jsonb(m)-'member_number')::text),
    'auth_hash',md5(to_jsonb(u)::text),'correction_type',p.correction_type) ORDER BY p.before_number)
    FROM private.member_number_name_reconciliation_plan() p JOIN public.members m ON m.id=p.member_id
    JOIN public.member_identity i ON i.member_id=m.id LEFT JOIN auth.users u ON u.id=m.user_id),
  'remaining_roster_mismatches',(SELECT jsonb_agg(jsonb_build_object('member_id',m.id,'name',i.full_name,
    'current',m.member_number,'expected',r.member_number)) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
    JOIN private.member_number_roster() r ON private.member_number_name_key(r.full_name)=private.member_number_name_key(i.full_name)
    WHERE m.record_scope='current' AND m.account_status NOT IN ('closed','suspended') AND m.anonymized_at IS NULL
      AND m.member_number IS DISTINCT FROM r.member_number),
  'released_pool',(SELECT jsonb_agg(jsonb_build_object('number',member_number,
    'available',private.member_number_is_released(member_number)) ORDER BY member_number) FROM private.member_number_released_manifest()),
  'next_available_released_number',(SELECT member_number FROM private.member_number_released_manifest()
    WHERE private.member_number_is_released(member_number) ORDER BY member_number LIMIT 1),
  'previous_swap',(SELECT jsonb_agg(jsonb_build_object('id',id,'number',member_number) ORDER BY id) FROM public.members
    WHERE id IN ('627b6d93-b5f0-4cb6-82c8-4f9e76b2225a'::uuid,'9fc90347-548d-4999-b75a-d40c15e43716'::uuid)),
  'notifications',(SELECT jsonb_build_object('count',count(*),'hash',md5(COALESCE(string_agg(md5(to_jsonb(n)::text),'' ORDER BY id),''))) FROM public.community_notifications n),
  'sequence',(SELECT jsonb_build_object('last_value',last_value,'is_called',is_called) FROM private.member_number_sequence),
  'disabled_triggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='D'
    AND tgrelid IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass)),
  'private_functions_exposed',EXISTS (SELECT 1 FROM (VALUES ('private.member_number_name_key(text)'),
      ('private.member_number_name_reconciliation_plan()'),('private.member_number_released_manifest()'),
      ('private.member_number_is_released(text)'),('private.member_number_next()')) f(signature)
    CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
    WHERE has_function_privilege(r.role_name,f.signature,'EXECUTE')),
  'corrections',(SELECT jsonb_agg(jsonb_build_object('id',id,'member_id',member_id_snapshot,
    'before',before_values->>'member_number','after',after_values->>'member_number') ORDER BY id)
    FROM private.member_profile_audit_log WHERE metadata->>'correction_scope'='roster_name_whitespace_reconciliation_2026_10_12'
      AND metadata->>'member_number_event'='roster_reconciliation'),
  'migration_registered',EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012134601')
) AS postflight;
COMMIT;
