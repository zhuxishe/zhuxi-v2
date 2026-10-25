#!/usr/bin/env node
// Generates, but never executes, an explicit schema+cleanup rollback rehearsal.
// PostgreSQL audit identity sequences can advance despite ROLLBACK. Prefer a
// native isolated database; do not misrepresent a production rehearsal as zero
// persistent side effects. The formal member-number sequence is asserted equal.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2), flags = Object.fromEntries(args.flatMap((s, i) => s.startsWith('--') ? [[s.slice(2), args[i + 1]]] : []))
const planOnly = args.includes('--plan-only')
if (!flags.manifest || !flags.out || !flags.actor) throw new Error('--manifest PRIVATE_FILE --out PRIVATE_SQL --actor ADMIN_UUID required')
if (!/^[0-9a-f-]{36}$/.test(flags.actor)) throw new Error('Invalid actor UUID')
const out = resolve(flags.out)
if (out.startsWith(`${root}/`)) throw new Error('Raw rehearsal payload must stay outside the repository')
const manifest = JSON.parse(await readFile(flags.manifest, 'utf8'))
if (manifest.expected_old_members.length !== 27) throw new Error('Expected exact27 manifest')
const files = ['20261025041723_replace_legacy_test_import_pool.sql', '20261025041806_test_account_pool_isolation.sql', '20261025061614_isolate_test_pool_access_helpers.sql']
const migrations = []
for (const name of files) {
  let sql = await readFile(resolve(root, 'supabase/migrations', name), 'utf8')
  if (!/^BEGIN;$/m.test(sql) || !/^COMMIT;\s*$/m.test(sql)) throw new Error(`Unexpected migration transaction structure ${name}`)
  sql = sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;\s*$/m, '')
  migrations.push(`-- Schema rehearsal: ${name}\n${sql}`)
}
const json = JSON.stringify(manifest.expected_old_members).replaceAll("'", "''")
const protectedFunction = `CREATE FUNCTION pg_temp.test_pool_protected_snapshot() RETURNS jsonb LANGUAGE sql AS $snapshot$
WITH people AS(SELECT unnest(ARRAY['f049f125-e2c2-42ac-b0e7-096592c62d2b','0bbeda0f-6c5b-49d0-bf06-c792c9ed1665','9fc90347-548d-4999-b75a-d40c15e43716']::uuid[]) id)
SELECT jsonb_build_object(
 'members',(SELECT jsonb_agg(to_jsonb(x)-'is_test' ORDER BY id) FROM public.members x WHERE id IN(SELECT id FROM people)),
 'identity',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.member_identity x WHERE member_id IN(SELECT id FROM people)),
 'language',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.member_language x WHERE member_id IN(SELECT id FROM people)),
 'interests',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.member_interests x WHERE member_id IN(SELECT id FROM people)),
 'personality',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.member_personality x WHERE member_id IN(SELECT id FROM people)),
 'boundaries',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.member_boundaries x WHERE member_id IN(SELECT id FROM people)),
 'quiz',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.personality_quiz_results x WHERE member_id IN(SELECT id FROM people)),
 'responses',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.questionnaire_responses x WHERE member_id IN(SELECT id FROM people)),
 'assignments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY member_id,kind) FROM public.questionnaire_assignments x WHERE member_id IN(SELECT id FROM people)),
 'submissions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.match_round_submissions x WHERE member_id IN(SELECT id FROM people)),
 'templates',(SELECT jsonb_agg(to_jsonb(x) ORDER BY kind) FROM public.questionnaire_templates x),
 'versions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.questionnaire_versions x),
 'round',(SELECT to_jsonb(x)-'is_test' FROM public.match_rounds x WHERE id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda'),
 'formal_sequence',(SELECT jsonb_build_object('last_value',last_value,'is_called',is_called) FROM private.member_number_sequence),
 'notifications',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.community_notifications x))
$snapshot$;`
const sql = `-- EXPLICIT ROLLBACK REHEARSAL: never run as a migration.\n-- ${planOnly ? 'PLAN ONLY: no cleanup DELETE or audit identity allocation.' : 'Audit ID sequences may advance despite rollback.'} No setval or disabled trigger.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\n${protectedFunction}\nCREATE TEMP TABLE test_pool_baseline AS SELECT pg_temp.test_pool_protected_snapshot() snapshot;\n${migrations.join('\n')}\nSET LOCAL ROLE service_role;\nSELECT public.admin_cleanup_legacy_matching_test_pool('${flags.actor}','${json}'::jsonb,'Rollback rehearsal for exact legacy test pool cleanup',${planOnly ? 'true' : 'false'});\nRESET ROLE;\nDO $checks$\nBEGIN\n IF (SELECT snapshot FROM test_pool_baseline) IS DISTINCT FROM pg_temp.test_pool_protected_snapshot() THEN RAISE EXCEPTION 'PROTECTED_REAL_DATA_CHANGED'; END IF;\n IF (SELECT count(*) FROM public.members WHERE id=ANY(private.legacy_matching_test_pool_ids()))<>${planOnly ? 27 : 0} THEN RAISE EXCEPTION 'OLD_TEST_MEMBER_COUNT_FAILED'; END IF;\n IF (SELECT count(*) FROM matching_import.identities WHERE created_by_request_id='986e22c9-12b8-402a-bee4-f3abeea37291' AND member_id IS ${planOnly ? 'NOT NULL' : 'NULL'})<>27 THEN RAISE EXCEPTION 'IDENTITY_COUNT_FAILED'; END IF;\n IF NOT EXISTS(SELECT 1 FROM public.match_rounds WHERE id='b17e1e9b-72d7-4bbb-b3bb-17486f6eebda' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'ORIGINAL_ROUND_MISSING'; END IF;\nEND $checks$;\nSELECT jsonb_build_object('rehearsal_checks_passed',true,'plan_only',${planOnly},'legacy_members_remaining',${planOnly ? 27 : 0},'real_profiles_questionnaires_submissions_preserved',true,'original_templates_preserved',true,'formal_sequence_unchanged',true,'notifications_unchanged',true,'will_rollback',true) rehearsal;\nROLLBACK;\n`
await mkdir(dirname(out), { recursive: true, mode: 0o700 }); await writeFile(out, sql, { mode: 0o600, flag: 'wx' })
console.log(JSON.stringify({ generated: out, executed: false, plan_only: planOnly, ...(planOnly ? {} : { warning: 'Audit ID sequences may advance despite rollback; prefer isolated native PostgreSQL' }) }))
