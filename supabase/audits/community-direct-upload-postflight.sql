-- Read-only postflight for the direct image upload release. Contains no user rows.
BEGIN READ ONLY;
DO $$
DECLARE
  v_name text;
  v_signature regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets
    WHERE id = 'community-upload-staging' AND NOT public AND file_size_limit = 20971520) THEN
    RAISE EXCEPTION 'Private 20MiB staging bucket is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('community-media','community-avatars') AND public) THEN
    RAISE EXCEPTION 'Final community buckets must remain private';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'private.community_direct_uploads'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Direct upload session RLS is disabled';
  END IF;
  IF has_table_privilege('anon', 'private.community_direct_uploads', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'private.community_direct_uploads', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Direct upload sessions are exposed to clients';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname='community_staging_private_access' AND permissive='RESTRICTIVE' AND cmd='ALL') THEN
    RAISE EXCEPTION 'Staging object isolation policy is missing';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'public.community_prepare_direct_upload(uuid,uuid,text,bigint)',
    'public.community_claim_direct_upload(uuid,uuid)',
    'public.community_finish_direct_upload(uuid,uuid,uuid,jsonb)',
    'public.community_cancel_direct_upload(uuid,uuid,uuid)',
    'public.community_queue_expired_direct_uploads()',
    'public.community_claim_staging_cleanup(integer)',
    'public.community_complete_staging_cleanup(uuid,text)'
  ] LOOP
    v_signature := v_name::regprocedure;
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
      OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
      OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected direct upload function grants: %', v_name;
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid=v_signature) THEN
      RAISE EXCEPTION 'Direct upload functions should use invoker privileges: %', v_name;
    END IF;
  END LOOP;
END;
$$;
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets
  WHERE id IN ('community-upload-staging','community-media','community-avatars') ORDER BY id;
SELECT policyname, permissive, roles, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname IN ('community_staging_private_access','community_storage_route_only_insert','community_storage_route_only_update','community_storage_route_only_delete') ORDER BY policyname;
SELECT state, count(*) AS sessions FROM private.community_direct_uploads GROUP BY state ORDER BY state;
COMMIT;
