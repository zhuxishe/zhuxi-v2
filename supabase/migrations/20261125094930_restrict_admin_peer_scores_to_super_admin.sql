-- Restrict the three score readers without changing the shared review authorization.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  signature regprocedure;
  definition text;
  admin_check constant text := 'PERFORM private.peer_current_admin();';
  super_admin_check constant text := $guard$
 IF NOT private.member_master_is_super_admin() THEN
   RAISE EXCEPTION 'PEER_SUPER_ADMIN_REQUIRED' USING ERRCODE = '42501';
 END IF;$guard$;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'unified_peer_review.member_peer_score(uuid)'::regprocedure,
    'unified_peer_review.list_member_scores(text,integer,integer,text,text,text)'::regprocedure,
    'unified_peer_review.member_score_detail(uuid,text,integer,integer,uuid)'::regprocedure
  ]
  LOOP
    definition := pg_get_functiondef(signature);
    IF (length(definition) - length(replace(definition, admin_check, ''))) <> length(admin_check)
       OR strpos(definition, super_admin_check) > 0 THEN
      RAISE EXCEPTION 'Unexpected authorization definition for %', signature;
    END IF;
    EXECUTE replace(definition, admin_check, admin_check || super_admin_check);
  END LOOP;
END;
$migration$;

COMMIT;
