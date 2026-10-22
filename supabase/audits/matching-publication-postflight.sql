BEGIN READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT jsonb_build_object(
 'migration_registered',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261022183350'),
 'schema_exposure',current_setting('pgrst.db_schemas',true),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',n.nspname||'.'||p.proname,'definer',p.prosecdef,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE'),'config',p.proconfig)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='matching_publication' OR (n.nspname='public' AND p.proname IN ('admin_finalize_matching_session','admin_publish_match_session','admin_unpublish_match_session','admin_delete_match_session_draft','admin_approve_matching_cancellation','admin_reject_matching_cancellation','get_my_matching_publications'))),
 'private_tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'auth_select',has_table_privilege('authenticated',c.oid,'SELECT'),'auth_insert',has_table_privilege('authenticated',c.oid,'INSERT'),'auth_update',has_table_privilege('authenticated',c.oid,'UPDATE'),'auth_delete',has_table_privilege('authenticated',c.oid,'DELETE'))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='matching_publication' AND c.relkind='r'),
 'guards',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled)) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'matching_publication_guard_%'),
 'publication_count',(SELECT count(*) FROM matching_publication.publications),
 'assignment_count',(SELECT count(*) FROM matching_publication.active_assignments),
 'duplicate_assignments',(SELECT count(*) FROM (SELECT round_id,member_id FROM matching_publication.active_assignments GROUP BY round_id,member_id HAVING count(*)>1) conflicts),
 'context_count',(SELECT count(*) FROM matching_publication.write_context),
 'new_notification_count',(SELECT count(*) FROM public.community_notifications WHERE match_publication_id IS NOT NULL)
) AS snapshot;
ROLLBACK;
