-- Read-only confirmation; compare hashes to the saved preflight snapshot.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'targets', (SELECT jsonb_agg(jsonb_build_object(
    'member_id',m.id,'full_name',i.full_name,'member_number',m.member_number,
    'other_fields_hash',md5((to_jsonb(m)-'member_number')::text),
    'auth_hash',md5(to_jsonb(u)::text),
    'expected_number',CASE WHEN m.id='627b6d93-b5f0-4cb6-82c8-4f9e76b2225a'::uuid THEN 'ZXS_249' ELSE 'ZXS_250' END,
    'correct',m.member_number=CASE WHEN m.id='627b6d93-b5f0-4cb6-82c8-4f9e76b2225a'::uuid THEN 'ZXS_249' ELSE 'ZXS_250' END
  ) ORDER BY m.id) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
    LEFT JOIN auth.users u ON u.id=m.user_id
    WHERE m.id IN ('627b6d93-b5f0-4cb6-82c8-4f9e76b2225a'::uuid,'9fc90347-548d-4999-b75a-d40c15e43716'::uuid)),
  'correction_audit', (SELECT jsonb_agg(jsonb_build_object(
    'id',id,'member_id',member_id_snapshot,'before',before_values->>'member_number',
    'after',after_values->>'member_number','source',source,'created_at',created_at
  ) ORDER BY id) FROM private.member_profile_audit_log
    WHERE metadata->>'correction_scope'='member_number_249_250_swap_2026_10_12'),
  'notifications', (SELECT jsonb_build_object('count',count(*),
    'hash',md5(COALESCE(string_agg(md5(to_jsonb(n)::text),'' ORDER BY id),''))) FROM public.community_notifications n),
  'sequence', (SELECT jsonb_build_object('last_value',last_value,'is_called',is_called) FROM private.member_number_sequence),
  'disabled_triggers', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='D'
    AND tgrelid IN ('public.members'::regclass,'private.member_profile_audit_log'::regclass)),
  'migration_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012121626')
) AS postflight;
COMMIT;
