-- Allow the merged choice without rewriting historical answers or other validation.
DO $migration$
DECLARE
  definition text;
  original_fragment constant text := $old$WHEN 'ideal_group_size' THEN ARRAY['2人', '3-4人', '4-5人', '6-7人', '8-10人', '10人以上', '都可以']$old$;
  replacement_fragment constant text := $new$WHEN 'ideal_group_size' THEN ARRAY['2人', '3-4人', '4-10人', '4-5人', '6-7人', '8-10人', '10人以上', '都可以']$new$;
BEGIN
  definition := pg_catalog.pg_get_functiondef('public.save_my_supplementary(jsonb)'::regprocedure);
  IF position(replacement_fragment IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(original_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'GROUP_SIZE_VALIDATION_BASELINE_MISMATCH';
  END IF;
  EXECUTE replace(definition, original_fragment, replacement_fragment);
END;
$migration$;
