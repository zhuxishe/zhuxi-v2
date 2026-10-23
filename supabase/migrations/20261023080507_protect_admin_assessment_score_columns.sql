BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Shared assessment scores are admin-only. The legacy A columns remain as
-- internal mirrors/history, and matching keeps consuming the members mirror.
-- Results also contain a score decomposition and a total from which A can be
-- inferred, so neither is part of the member-facing result projection.
-- Keep existing row policies and all non-SELECT privileges unchanged. Ordinary
-- admin sessions use guarded admin RPCs for these fields; service_role retains
-- its existing access for server-side matching and administration.
DO $permissions$
DECLARE
  v_target record;
  v_allowed_columns text;
  v_protected_columns text;
  v_column text;
  v_role text;
BEGIN
  FOR v_target IN
    SELECT * FROM (VALUES
      ('members', ARRAY['attractiveness_score']::text[]),
      ('interview_evaluations', ARRAY['attractiveness_score']::text[]),
      ('match_results', ARRAY['score_breakdown', 'total_score']::text[])
    ) AS targets(table_name, protected_columns)
  LOOP
    -- Fail rather than silently skipping a renamed/missing sensitive column.
    FOREACH v_column IN ARRAY v_target.protected_columns LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = pg_catalog.to_regclass('public.' || v_target.table_name)
          AND attname = v_column AND attnum > 0 AND NOT attisdropped
      ) THEN
        RAISE EXCEPTION 'Missing protected assessment column: %.%', v_target.table_name, v_column;
      END IF;
    END LOOP;

    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
      INTO v_allowed_columns
    FROM pg_catalog.pg_attribute
    WHERE attrelid = pg_catalog.to_regclass('public.' || v_target.table_name)
      AND attnum > 0 AND NOT attisdropped
      AND NOT attname = ANY(v_target.protected_columns);

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
      INTO v_protected_columns
    FROM unnest(v_target.protected_columns) AS columns(column_name);

    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_target.table_name);
    -- Table-level revocation does not remove pre-existing column-level grants.
    EXECUTE format('REVOKE SELECT (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_protected_columns, v_target.table_name);
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO anon, authenticated', v_allowed_columns, v_target.table_name);

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, 'public.' || v_target.table_name, 'SELECT') THEN
        RAISE EXCEPTION 'Unexpected inherited table SELECT: % on %', v_role, v_target.table_name;
      END IF;
      FOREACH v_column IN ARRAY v_target.protected_columns LOOP
        IF has_column_privilege(v_role, 'public.' || v_target.table_name, v_column, 'SELECT') THEN
          RAISE EXCEPTION 'Protected assessment column remains readable: % on %.%', v_role, v_target.table_name, v_column;
        END IF;
        IF NOT has_column_privilege('service_role', 'public.' || v_target.table_name, v_column, 'SELECT') THEN
          RAISE EXCEPTION 'Server assessment access is missing: %.%', v_target.table_name, v_column;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$permissions$;

-- Future columns need an explicit access decision; do not restore table SELECT.
NOTIFY pgrst, 'reload schema';
COMMIT;
