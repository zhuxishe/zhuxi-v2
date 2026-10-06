-- Read-only postflight; run as an authorized database administrator.
WITH active_members AS (
  SELECT m.*, i.full_name FROM public.members m
  LEFT JOIN public.member_identity i ON i.member_id = m.id
  WHERE m.record_scope = 'current' AND m.record_source NOT IN ('legacy', 'import')
    AND m.account_status <> 'closed' AND m.anonymized_at IS NULL
), helper_permissions AS (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private' AND p.proname LIKE 'member_number_%'
), checks AS (
  SELECT 'roster_has_248_entries' AS name, (SELECT count(*) = 248 FROM private.member_number_roster()) AS passed
  UNION ALL SELECT 'roster_has_unique_numbers', (SELECT count(*) = count(DISTINCT member_number) FROM private.member_number_roster())
  UNION ALL SELECT 'wu_fan_roster_081', EXISTS (SELECT 1 FROM private.member_number_roster() WHERE full_name = '吴璠' AND member_number = 'ZXS_081')
  UNION ALL SELECT 'all_named_current_members_have_number', NOT EXISTS (SELECT 1 FROM active_members WHERE NULLIF(btrim(full_name), '') IS NOT NULL AND member_number IS NULL)
  UNION ALL SELECT 'current_numbers_are_canonical', NOT EXISTS (SELECT 1 FROM active_members WHERE member_number IS NOT NULL AND member_number IS DISTINCT FROM private.member_number_canonical(member_number))
  UNION ALL SELECT 'current_roster_numbers_match', NOT EXISTS (SELECT 1 FROM active_members m JOIN private.member_number_roster() r ON btrim(m.full_name) = r.full_name WHERE m.member_number IS DISTINCT FROM r.member_number)
  UNION ALL SELECT 'no_duplicate_numbers', NOT EXISTS (SELECT member_number FROM public.members WHERE member_number IS NOT NULL GROUP BY member_number HAVING count(*) > 1)
  UNION ALL SELECT 'sequence_at_least_historical_high_water', (SELECT last_value >= private.member_number_max_issued() FROM private.member_number_sequence)
  UNION ALL SELECT 'number_triggers_enabled', (SELECT count(*) = 3 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN ('member_number_before_write','member_number_audit_change','member_number_on_identity_saved'))
  UNION ALL SELECT 'helpers_not_executable_by_clients', NOT EXISTS (SELECT 1 FROM helper_permissions h CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role) WHERE has_function_privilege(r.role,h.oid,'EXECUTE'))
  UNION ALL SELECT 'sequence_not_accessible_by_clients', NOT EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) r(role) WHERE has_sequence_privilege(r.role,'private.member_number_sequence','USAGE,SELECT,UPDATE'))
  UNION ALL SELECT 'obsolete_number_rpc_stays_disabled', NOT has_function_privilege('authenticated','public.admin_update_member_number(uuid,text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.admin_update_member_number(uuid,text,text)','EXECUTE')
  UNION ALL SELECT 'format_constraint_validated', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass AND conname='members_current_member_number_format_check' AND convalidated)
  UNION ALL SELECT 'migration_recorded', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261006111856')
)
SELECT jsonb_build_object('checks',jsonb_agg(jsonb_build_object('name',name,'passed',passed)), 'all_passed',bool_and(passed)) AS postflight FROM checks;
