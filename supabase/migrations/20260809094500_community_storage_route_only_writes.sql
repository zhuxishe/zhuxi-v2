-- Community images must pass the server-side size, pixel, format, and
-- processed-upload registration checks. Authenticated Storage writes can
-- bypass those checks and create objects that are never queued for cleanup.

DROP POLICY IF EXISTS community_storage_insert ON storage.objects;
DROP POLICY IF EXISTS community_storage_update ON storage.objects;
DROP POLICY IF EXISTS community_storage_delete ON storage.objects;

-- Restrictive policies keep these two buckets server-write-only even if a
-- separate permissive Storage policy is added later. The service role used by
-- the upload routes bypasses RLS; authenticated reads remain governed by
-- community_storage_read.
DROP POLICY IF EXISTS community_storage_route_only_insert ON storage.objects;
CREATE POLICY community_storage_route_only_insert
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('community-avatars', 'community-media')
  );

DROP POLICY IF EXISTS community_storage_route_only_update ON storage.objects;
CREATE POLICY community_storage_route_only_update
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    bucket_id NOT IN ('community-avatars', 'community-media')
  )
  WITH CHECK (
    bucket_id NOT IN ('community-avatars', 'community-media')
  );

DROP POLICY IF EXISTS community_storage_route_only_delete ON storage.objects;
CREATE POLICY community_storage_route_only_delete
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    bucket_id NOT IN ('community-avatars', 'community-media')
  );
