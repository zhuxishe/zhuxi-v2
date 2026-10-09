-- Raw photos are uploaded directly to a private staging bucket; only the server
-- may normalize/register them for publication. Final buckets/policies are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('community-upload-staging', 'community-upload-staging', false, 20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Even an unrelated permissive Storage policy must not expose raw originals.
-- Signed upload tokens are issued by the service client for one exact path.
CREATE POLICY community_staging_private_access ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'community-upload-staging')
  WITH CHECK (bucket_id <> 'community-upload-staging');

CREATE TABLE private.community_direct_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('photo', 'avatar', 'profile-avatar')),
  expected_size bigint NOT NULL CHECK (expected_size BETWEEN 1 AND 20971520),
  staging_path text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  processing_started_at timestamptz,
  claim_token uuid,
  storage_path text,
  thumbnail_path text,
  result jsonb,
  cleanup_queued boolean NOT NULL DEFAULT false,
  CHECK ((state = 'processing') = (claim_token IS NOT NULL)),
  CHECK (state <> 'completed' OR result IS NOT NULL)
);
CREATE INDEX community_direct_uploads_member_created_idx
  ON private.community_direct_uploads (member_id, created_at DESC);
CREATE INDEX community_direct_uploads_cleanup_idx
  ON private.community_direct_uploads (created_at) WHERE NOT cleanup_queued;
ALTER TABLE private.community_direct_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.community_direct_uploads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.community_direct_uploads TO service_role;

GRANT USAGE, SELECT ON SEQUENCE private.community_media_cleanup_queue_id_seq TO service_role;

ALTER TABLE private.community_media_cleanup_queue
  DROP CONSTRAINT community_media_cleanup_queue_bucket_id_check;
ALTER TABLE private.community_media_cleanup_queue
  ADD CONSTRAINT community_media_cleanup_queue_bucket_id_check CHECK (
    bucket_id IN ('community-avatars', 'community-media', 'staff-avatars', 'community-upload-staging')
  );

CREATE OR REPLACE FUNCTION public.community_prepare_direct_upload(
  p_member_id uuid, p_user_id uuid, p_kind text, p_expected_size bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_upload private.community_direct_uploads;
  v_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id AND user_id = p_user_id AND status = 'approved') THEN
    RAISE EXCEPTION 'Approved member not found';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('photo', 'avatar', 'profile-avatar')
    OR p_expected_size IS NULL OR p_expected_size NOT BETWEEN 1 AND 20971520 THEN
    RAISE EXCEPTION 'Invalid upload metadata';
  END IF;
  -- Serialize concurrent prepares for the same member so a nine-photo batch
  -- cannot race around the outstanding/hourly limits.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text, 901));
  IF (SELECT count(*) FROM private.community_direct_uploads
      WHERE member_id = p_member_id AND state IN ('pending', 'processing') AND expires_at > now()) >= 18
    OR (SELECT count(*) FROM private.community_direct_uploads
      WHERE member_id = p_member_id AND created_at > now() - interval '1 hour') >= 60
    OR (SELECT count(*) FROM private.community_direct_uploads
      WHERE member_id = p_member_id AND created_at > now() - interval '1 day') >= 240 THEN
    RAISE EXCEPTION 'Direct upload limit reached';
  END IF;
  INSERT INTO private.community_direct_uploads(id, member_id, user_id, kind, expected_size, staging_path)
  VALUES(v_id, p_member_id, p_user_id, p_kind, p_expected_size, p_user_id::text || '/' || v_id::text || '/original')
  RETURNING * INTO v_upload;
  RETURN to_jsonb(v_upload);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_claim_direct_upload(
  p_upload_id uuid, p_member_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_upload private.community_direct_uploads;
  v_token uuid := gen_random_uuid();
  v_bucket text;
  v_folder text;
  v_path text;
BEGIN
  SELECT * INTO v_upload FROM private.community_direct_uploads
    WHERE id = p_upload_id AND member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Direct upload not found'; END IF;
  IF v_upload.state = 'completed' THEN RETURN to_jsonb(v_upload); END IF;
  IF v_upload.state = 'cancelled' THEN RAISE EXCEPTION 'Direct upload cancelled'; END IF;
  IF v_upload.expires_at <= now() THEN RAISE EXCEPTION 'Direct upload expired'; END IF;
  IF v_upload.state = 'processing' AND v_upload.processing_started_at > now() - interval '5 minutes' THEN
    RETURN to_jsonb(v_upload) || jsonb_build_object('busy', true);
  END IF;
  v_bucket := CASE WHEN v_upload.kind = 'photo' THEN 'community-media' ELSE 'community-avatars' END;
  v_folder := CASE WHEN v_upload.kind = 'photo' THEN 'photos' ELSE 'avatars' END;
  -- A timed-out worker gets distinct output paths; its files remain reclaimable.
  IF v_upload.storage_path IS NOT NULL THEN
    INSERT INTO private.community_media_cleanup_queue(bucket_id, object_path, reason)
      SELECT v_bucket, path, 'direct_upload_abandoned_attempt'
      FROM (SELECT DISTINCT unnest(ARRAY[v_upload.storage_path, v_upload.thumbnail_path]) AS path) paths
      WHERE path IS NOT NULL
    ON CONFLICT (bucket_id, object_path) DO UPDATE SET processed_at = NULL, claimed_at = NULL,
      claim_token = NULL, queued_at = now(), last_error = NULL;
  END IF;
  v_path := v_upload.user_id::text || '/' || v_folder || '/' || v_upload.id::text || '-' || v_token::text;
  UPDATE private.community_direct_uploads SET state = 'processing', claim_token = v_token,
    processing_started_at = now(), storage_path = v_path || '.webp',
    thumbnail_path = v_path || CASE WHEN kind = 'photo' THEN '-thumb.webp' ELSE '.webp' END
    WHERE id = p_upload_id RETURNING * INTO v_upload;
  RETURN to_jsonb(v_upload);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_finish_direct_upload(
  p_upload_id uuid, p_member_id uuid, p_claim_token uuid, p_result jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_upload private.community_direct_uploads;
  v_bucket text;
BEGIN
  SELECT * INTO v_upload FROM private.community_direct_uploads
    WHERE id = p_upload_id AND member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Direct upload not found'; END IF;
  IF v_upload.state = 'completed' THEN RETURN v_upload.result; END IF;
  IF v_upload.state <> 'processing' OR p_claim_token IS DISTINCT FROM v_upload.claim_token THEN
    RAISE EXCEPTION 'Direct upload claim expired';
  END IF;
  IF p_result IS NULL OR p_result->>'storagePath' IS DISTINCT FROM v_upload.storage_path
    OR p_result->>'thumbnailPath' IS DISTINCT FROM v_upload.thumbnail_path
    OR p_result->>'mimeType' IS DISTINCT FROM 'image/webp' THEN
    RAISE EXCEPTION 'Invalid processed upload result';
  END IF;
  v_bucket := CASE WHEN v_upload.kind = 'photo' THEN 'community-media' ELSE 'community-avatars' END;
  PERFORM public.community_register_processed_upload(p_member_id, v_bucket,
    v_upload.storage_path, v_upload.thumbnail_path, (p_result->>'width')::integer,
    (p_result->>'height')::integer, (p_result->>'byteSize')::bigint, 'image/webp');
  UPDATE private.community_direct_uploads SET state = 'completed', claim_token = NULL,
    processing_started_at = NULL, result = p_result WHERE id = p_upload_id;
  RETURN p_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_cancel_direct_upload(
  p_upload_id uuid, p_member_id uuid, p_claim_token uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_upload private.community_direct_uploads;
  v_bucket text;
BEGIN
  SELECT * INTO v_upload FROM private.community_direct_uploads
    WHERE id = p_upload_id AND member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Direct upload not found'; END IF;
  -- False also covers a lost finish response: never delete committed outputs.
  IF v_upload.state = 'completed' THEN RETURN false; END IF;
  IF p_claim_token IS NOT NULL AND p_claim_token IS DISTINCT FROM v_upload.claim_token THEN RETURN false; END IF;
  UPDATE private.community_direct_uploads SET state = 'cancelled', claim_token = NULL,
    processing_started_at = NULL WHERE id = p_upload_id;
  v_bucket := CASE WHEN v_upload.kind = 'photo' THEN 'community-media' ELSE 'community-avatars' END;
  INSERT INTO private.community_media_cleanup_queue(bucket_id, object_path, reason)
    SELECT bucket, path, 'direct_upload_cancelled'
    FROM (SELECT 'community-upload-staging' AS bucket, v_upload.staging_path AS path
      UNION SELECT v_bucket, v_upload.storage_path
      UNION SELECT v_bucket, v_upload.thumbnail_path) paths WHERE path IS NOT NULL
  ON CONFLICT (bucket_id, object_path) DO UPDATE SET processed_at = NULL, claimed_at = NULL,
    claim_token = NULL, queued_at = now(), last_error = NULL;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_queue_expired_direct_uploads()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_upload private.community_direct_uploads;
  v_bucket text;
  v_count integer := 0;
BEGIN
  -- Be conservative about both credential lifetimes: signed tokens last two
  -- hours and a TUS upload URL can live 24 hours from creation. An URL created
  -- near token expiry is covered by 27 hours including one hour grace, even if
  -- a Storage version changes its per-request signature-expiry enforcement.
  -- Recheck after immediate deletion so old credentials cannot orphan originals.
  FOR v_upload IN SELECT * FROM private.community_direct_uploads
    WHERE NOT cleanup_queued AND created_at < now() - interval '27 hours'
    ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    v_bucket := CASE WHEN v_upload.kind = 'photo' THEN 'community-media' ELSE 'community-avatars' END;
    INSERT INTO private.community_media_cleanup_queue(bucket_id, object_path, reason)
      SELECT bucket, path, 'direct_upload_expired'
      FROM (SELECT 'community-upload-staging' AS bucket, v_upload.staging_path AS path
          WHERE EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'community-upload-staging' AND name = v_upload.staging_path)
        UNION SELECT v_bucket, v_upload.storage_path WHERE v_upload.state <> 'completed'
        UNION SELECT v_bucket, v_upload.thumbnail_path WHERE v_upload.state <> 'completed') paths
      WHERE path IS NOT NULL
    ON CONFLICT (bucket_id, object_path) DO UPDATE SET processed_at = NULL, claimed_at = NULL,
      claim_token = NULL, queued_at = now(), last_error = NULL;
    UPDATE private.community_direct_uploads SET cleanup_queued = true,
      state = CASE WHEN state = 'completed' THEN state ELSE 'cancelled' END,
      claim_token = NULL, processing_started_at = NULL WHERE id = v_upload.id;
    v_count := v_count + 1;
  END LOOP;
  DELETE FROM private.community_direct_uploads WHERE cleanup_queued AND created_at < now() - interval '7 days';
  RETURN v_count;
END;
$$;


-- Raw-file cleanup is batched separately so it does not compete with the small
-- established final-media cleanup worker or require 500 individual HTTP calls.
CREATE OR REPLACE FUNCTION public.community_claim_staging_cleanup(p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_token uuid := gen_random_uuid();
  v_paths jsonb;
BEGIN
  WITH candidates AS (
    SELECT id FROM private.community_media_cleanup_queue
    WHERE bucket_id = 'community-upload-staging' AND processed_at IS NULL
      AND (claimed_at IS NULL OR claimed_at <= now() - interval '15 minutes')
    ORDER BY queued_at, id LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE private.community_media_cleanup_queue q SET claimed_at = now(), claim_token = v_token, last_error = NULL
    FROM candidates c WHERE q.id = c.id RETURNING q.object_path
  ) SELECT COALESCE(jsonb_agg(object_path), '[]'::jsonb) INTO v_paths FROM claimed;
  RETURN jsonb_build_object('claimToken', v_token, 'paths', v_paths);
END;
$$;

CREATE OR REPLACE FUNCTION public.community_complete_staging_cleanup(p_claim_token uuid, p_error text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE private.community_media_cleanup_queue SET
    processed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
    claimed_at = NULL, claim_token = NULL, last_error = p_error
  WHERE bucket_id = 'community-upload-staging' AND claim_token = p_claim_token AND processed_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.community_prepare_direct_upload(uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_claim_direct_upload(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_finish_direct_upload(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_cancel_direct_upload(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_queue_expired_direct_uploads() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_claim_staging_cleanup(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_complete_staging_cleanup(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_claim_staging_cleanup(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_complete_staging_cleanup(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_prepare_direct_upload(uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_claim_direct_upload(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_finish_direct_upload(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_cancel_direct_upload(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_queue_expired_direct_uploads() TO service_role;

COMMIT;
