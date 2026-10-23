// Offline SQL generator. Never opens a database/network connection.
// The approved manifest and generated SQL contain personal data: keep them outside Git.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const SCORE_KEYS = ['attractiveness_score', 'sexual_value_score', 'economic_value_score', 'emotional_value_score']
export const EXPECTED_COUNT = 55

export function validateManifest(input) {
  if (!input || !/^[a-z0-9][a-z0-9_.-]{3,99}$/.test(input.batch ?? '')) throw new Error('Invalid batch identifier')
  if (!/^[a-f0-9]{64}$/.test(input.source_sha256 ?? '')) throw new Error('Invalid source SHA-256')
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(input.sheet_id ?? '') || !Number.isSafeInteger(input.gid) || input.gid < 0) throw new Error('Invalid sheet reference')
  if (!Array.isArray(input.rows) || input.rows.length !== EXPECTED_COUNT) throw new Error('Manifest must contain exactly 55 approved members')
  const ids = new Set(), numbers = new Set(), sourceRows = new Set()
  const rows = input.rows.map((row, index) => {
    const fail = message => { throw new Error(`Manifest item ${index + 1}: ${message}`) }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.member_id ?? '')) fail('invalid UUID')
    const memberId = row.member_id.toLowerCase()
    if (!/^ZXS_[0-9]{3,18}$/.test(row.member_number ?? '')) fail('invalid member number')
    if (typeof row.expected_name !== 'string' || !row.expected_name.trim() || row.expected_name.length > 200 || row.expected_name.includes('\0')) fail('invalid expected name')
    if (row.expected_attractiveness_score !== null) fail('approved baseline A must be explicitly null')
    if (!Number.isSafeInteger(row.row) || row.row < 2) fail('invalid source row')
    if (ids.has(memberId) || numbers.has(row.member_number) || sourceRows.has(row.row)) fail('duplicate member, number or source row')
    ids.add(memberId); numbers.add(row.member_number); sourceRows.add(row.row)
    for (const key of SCORE_KEYS) if (!Number.isInteger(row[key]) || row[key] < 1 || row[key] > 5) fail(`${key} must be an integer from 1 to 5`)
    return { row: row.row, member_id: memberId, member_number: row.member_number, expected_name: row.expected_name,
      expected_attractiveness_score: null, ...Object.fromEntries(SCORE_KEYS.map(key => [key, row[key]])) }
  }).sort((a, b) => a.member_id.localeCompare(b.member_id))
  return { batch: input.batch, source_sha256: input.source_sha256, sheet_id: input.sheet_id, gid: input.gid, rows }
}

// E literals make escaping independent of the connection's string settings.
const literal = value => `E'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
const exactScores = (left, right) => SCORE_KEYS.map(key => `${left}.${key} IS NOT DISTINCT FROM ${right}.${key}`).join(' AND ')

export function generateImportSql(input, mode = 'dry-run') {
  if (!['dry-run', 'apply'].includes(mode)) throw new Error('Mode must be dry-run or apply')
  const manifest = validateManifest(input)
  const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  const batch = literal(manifest.batch)
  const reason = literal(`一次性 Google AM–AP 导入；已由用户确认对应关系；manifest_sha256=${digest}`)
  const scoreJsonCheck = SCORE_KEYS.map(key => `(a.after_values->>'${key}')::integer IS NOT DISTINCT FROM x.${key}`).join(' AND ')
  const protectedMembers = `SELECT count(*) AS row_count, md5(COALESCE(string_agg((CASE WHEN x.member_id IS NULL THEN to_jsonb(m) ELSE to_jsonb(m) - ARRAY['attractiveness_score','updated_at'] END)::text, E'\\n' ORDER BY m.id), '')) AS hash FROM public.members m LEFT JOIN pg_temp.composite_import_input x ON x.member_id = m.id`
  const hashTable = name => `SELECT count(*) AS row_count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY t.id), '')) AS hash FROM ${name} t`
  const snapshot = `SELECT jsonb_build_object(
      'members', (SELECT to_jsonb(v) FROM (${protectedMembers}) v),
      'identities', (SELECT to_jsonb(v) FROM (${hashTable('public.member_identity')}) v),
      'evaluations', (SELECT to_jsonb(v) FROM (${hashTable('public.interview_evaluations')}) v),
      'notifications', (SELECT to_jsonb(v) FROM (${hashTable('public.community_notifications')}) v)
    )`
  return `-- Generated offline; contains personal data. Do not commit this SQL.
-- Batch: ${manifest.batch}; manifest SHA-256: ${digest}
-- Mode: ${mode}. Run the entire transaction in one connection with stop-on-error.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
CREATE TEMP TABLE composite_import_input ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(${literal(JSON.stringify(manifest.rows))}::jsonb) AS x(
  row integer, member_id uuid, member_number text, expected_name text,
  expected_attractiveness_score integer, attractiveness_score integer,
  sexual_value_score integer, economic_value_score integer, emotional_value_score integer
);
ALTER TABLE pg_temp.composite_import_input ADD PRIMARY KEY (member_id);
CREATE TEMP TABLE composite_import_result (result jsonb) ON COMMIT DROP;
DO $import$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_target_before jsonb;
  v_batch_audit_count integer;
  v_score_rows_before integer;
  v_audit_rows_before integer;
  v_changed integer := 0;
  v_equal integer;
  v_status text := 'applied';
BEGIN
  IF (SELECT count(*) FROM pg_temp.composite_import_input) <> 55
    OR (SELECT count(DISTINCT member_number) FROM pg_temp.composite_import_input) <> 55
    OR (SELECT count(DISTINCT row) FROM pg_temp.composite_import_input) <> 55
    OR EXISTS (SELECT 1 FROM pg_temp.composite_import_input WHERE
      expected_attractiveness_score IS NOT NULL OR ${SCORE_KEYS.map(key => `${key} IS NULL OR ${key} NOT BETWEEN 1 AND 5`).join(' OR ')}) THEN
    RAISE EXCEPTION 'COMPOSITE_IMPORT_INVALID_MANIFEST';
  END IF;
  -- All writes use the same member-first lock order as the shared-score editor.
  PERFORM m.id FROM public.members m JOIN pg_temp.composite_import_input x ON x.member_id=m.id ORDER BY m.id FOR UPDATE OF m;
  PERFORM i.id FROM public.member_identity i JOIN pg_temp.composite_import_input x ON x.member_id=i.member_id ORDER BY i.member_id FOR UPDATE OF i;
  IF (SELECT count(*) FROM public.members m JOIN public.member_identity i ON i.member_id=m.id
    JOIN pg_temp.composite_import_input x ON x.member_id=m.id
    WHERE m.member_number=x.member_number AND i.full_name=x.expected_name
      AND m.account_status <> 'closed' AND m.anonymized_at IS NULL) <> 55 THEN
    RAISE EXCEPTION 'COMPOSITE_IMPORT_IDENTITY_OR_ACCOUNT_CHANGED';
  END IF;

  SELECT count(*) INTO v_batch_audit_count FROM private.member_composite_score_audit WHERE import_batch=${batch};
  IF v_batch_audit_count > 0 THEN
    -- Never replay an import over an administrator's later edit, even if values changed.
    IF v_batch_audit_count <> 55 OR (SELECT count(DISTINCT a.member_id)
      FROM private.member_composite_score_audit a JOIN pg_temp.composite_import_input x ON x.member_id=a.member_id
      WHERE a.import_batch=${batch} AND a.source='sheet_import' AND a.reason=${reason}
        AND ${scoreJsonCheck}) <> 55 THEN
      RAISE EXCEPTION 'COMPOSITE_IMPORT_BATCH_ALREADY_USED_DIFFERENTLY';
    END IF;
    v_status := 'already_applied';
  ELSE
    IF EXISTS (SELECT 1 FROM public.members m JOIN pg_temp.composite_import_input x ON x.member_id=m.id
      WHERE m.attractiveness_score IS DISTINCT FROM x.expected_attractiveness_score) THEN
      RAISE EXCEPTION 'COMPOSITE_IMPORT_MEMBER_A_CHANGED';
    END IF;
    PERFORM s.member_id FROM private.member_composite_scores s JOIN pg_temp.composite_import_input x ON x.member_id=s.member_id ORDER BY s.member_id FOR UPDATE OF s;
    IF EXISTS (SELECT 1 FROM private.member_composite_scores s JOIN pg_temp.composite_import_input x ON x.member_id=s.member_id
      WHERE ${SCORE_KEYS.map(key => `s.${key} IS NOT NULL`).join(' OR ')}) THEN
      RAISE EXCEPTION 'COMPOSITE_IMPORT_SHARED_SCORE_ALREADY_EXISTS';
    END IF;
  END IF;

  ${snapshot} INTO v_before;
  SELECT jsonb_agg(jsonb_build_object('member_id',m.id,'member_number',m.member_number,
    'attractiveness_score',m.attractiveness_score,'updated_at',m.updated_at,
    'interview_date',m.interview_date,'interviewer',m.interviewer,
    'shared_score_before',to_jsonb(s)) ORDER BY m.id) INTO v_target_before
    FROM public.members m JOIN pg_temp.composite_import_input x ON x.member_id=m.id
    LEFT JOIN private.member_composite_scores s ON s.member_id=m.id;
  SELECT count(*) INTO v_score_rows_before FROM private.member_composite_scores;
  SELECT count(*) INTO v_audit_rows_before FROM private.member_composite_score_audit;

  IF v_status = 'applied' THEN
    INSERT INTO private.member_composite_scores AS s (member_id, attractiveness_score,
      sexual_value_score, economic_value_score, emotional_value_score, source, reason, import_batch)
    SELECT member_id, attractiveness_score, sexual_value_score, economic_value_score,
      emotional_value_score, 'sheet_import', ${reason}, ${batch}
    FROM pg_temp.composite_import_input ORDER BY member_id
    ON CONFLICT (member_id) DO UPDATE SET
      attractiveness_score=EXCLUDED.attractiveness_score, sexual_value_score=EXCLUDED.sexual_value_score,
      economic_value_score=EXCLUDED.economic_value_score, emotional_value_score=EXCLUDED.emotional_value_score,
      actor_admin_id=NULL, source=EXCLUDED.source, reason=EXCLUDED.reason, import_batch=EXCLUDED.import_batch;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed <> 55 THEN RAISE EXCEPTION 'COMPOSITE_IMPORT_WRITE_COUNT_MISMATCH'; END IF;
    IF (SELECT count(*) FROM private.member_composite_score_audit) <> v_audit_rows_before + 55
      OR (SELECT count(*) FROM private.member_composite_score_audit WHERE import_batch=${batch}) <> 55 THEN
      RAISE EXCEPTION 'COMPOSITE_IMPORT_AUDIT_COUNT_MISMATCH';
    END IF;
  END IF;

  SELECT count(*) INTO v_equal FROM private.member_composite_scores s
    JOIN pg_temp.composite_import_input x ON x.member_id=s.member_id
    JOIN public.members m ON m.id=s.member_id
    WHERE ${exactScores('s', 'x')} AND m.attractiveness_score IS NOT DISTINCT FROM s.attractiveness_score;
  IF v_status='applied' AND v_equal <> 55 THEN RAISE EXCEPTION 'COMPOSITE_IMPORT_SCORE_OR_MIRROR_MISMATCH'; END IF;
  ${snapshot} INTO v_after;
  IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'COMPOSITE_IMPORT_UNEXPECTED_SIDE_EFFECT'; END IF;
  INSERT INTO pg_temp.composite_import_result VALUES (jsonb_build_object(
    'status',v_status,'mode',${literal(mode)},'batch',${batch},'manifest_sha256',${literal(digest)},
    'source_sha256',${literal(manifest.source_sha256)},'expected_members',55,'written_members',v_changed,
    'written_score_values',v_changed*4,'currently_identical_members',v_equal,
    'shared_rows_added',(SELECT count(*) FROM private.member_composite_scores)-v_score_rows_before,
    'audit_rows_added',(SELECT count(*) FROM private.member_composite_score_audit)-v_audit_rows_before,
    'protected_baseline',v_before,'protected_after',v_after,'target_before',v_target_before,
    'transaction_outcome',${literal(mode === 'apply' ? 'COMMIT requested; verify successful COMMIT and postflight' : 'ROLLBACK; no persistent score or audit rows')}
  ));
END;
$import$;
SELECT result AS composite_import_result FROM pg_temp.composite_import_result;
${mode === 'apply' ? 'COMMIT' : 'ROLLBACK'};
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 3 || args[1] !== '--mode') throw new Error('Usage: node member-composite-score-import.mjs <private-manifest.json> --mode dry-run|apply')
    process.stdout.write(generateImportSql(JSON.parse(readFileSync(args[0], 'utf8')), args[2]))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
