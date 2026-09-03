BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Browser uploads use a short-lived, single-path signed token. Enforce the
-- same size and MIME contract at Storage so forged client metadata cannot
-- bypass the application-level checks.
DO $do$
BEGIN
  IF to_regclass('public.content_media_cleanup_jobs') IS NULL
     OR to_regprocedure(
       'public.content_media_cleanup_referenced_paths_v2(uuid,text,text[])'
     ) IS NULL
     OR (
       SELECT count(*)
       FROM storage.buckets
       WHERE id = 'scripts'
         AND public IS FALSE
     ) <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_DIRECT_UPLOAD_REQUIRES_CONTRACT';
  END IF;
END
$do$;

-- Only a server-created signed upload URL may write these public delivery
-- buckets. Restrictive guards remain effective if a future permissive policy
-- accidentally grants broader direct Storage access.
DROP POLICY IF EXISTS content_v2_signed_public_media_insert_guard
  ON storage.objects;
CREATE POLICY content_v2_signed_public_media_insert_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id NOT IN ('scripts-covers', 'activity-media'));

DROP POLICY IF EXISTS content_v2_signed_public_media_update_guard
  ON storage.objects;
CREATE POLICY content_v2_signed_public_media_update_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (bucket_id NOT IN ('scripts-covers', 'activity-media'))
  WITH CHECK (bucket_id NOT IN ('scripts-covers', 'activity-media'));

DROP POLICY IF EXISTS content_v2_signed_public_media_delete_guard
  ON storage.objects;
CREATE POLICY content_v2_signed_public_media_delete_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO anon, authenticated
  USING (bucket_id NOT IN ('scripts-covers', 'activity-media'));

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'scripts-covers';

UPDATE storage.buckets
SET
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'activity-media';

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id IN ('scripts-covers', 'activity-media')
      AND (
        bucket.public IS DISTINCT FROM true
        OR bucket.file_size_limit IS DISTINCT FROM CASE bucket.id
          WHEN 'scripts-covers' THEN 5242880
          ELSE 8388608
        END
        OR bucket.allowed_mime_types IS NULL
        OR NOT bucket.allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
        OR NOT bucket.allowed_mime_types <@ ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
      )
  ) OR (
    SELECT count(*)
    FROM storage.buckets
    WHERE id IN ('scripts-covers', 'activity-media')
  ) <> 2 OR (
    SELECT count(*)
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'content_v2_signed_public_media_insert_guard',
        'content_v2_signed_public_media_update_guard',
        'content_v2_signed_public_media_delete_guard'
      )
      AND policy.permissive = 'RESTRICTIVE'
      AND policy.cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND policy.roles @> ARRAY['anon'::name, 'authenticated'::name]
  ) <> 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'CONTENT_V2_DIRECT_UPLOAD_BUCKET_LIMIT_INVALID';
  END IF;
END
$do$;

COMMIT;
