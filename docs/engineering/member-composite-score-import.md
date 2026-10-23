# One-time member composite score import

The offline generator consumes the separately approved 55-member manifest. It never queries a server. Names, scores, manifest files, generated SQL and returned baselines must remain in a private temporary/output location outside Git. The implementation contains only synthetic fixture data.

Prerequisite: deploy `member_composite_scores` and verify its permissions and matching A mirror. Confirm the explicitly selected production project; never rely on a locally linked project. Do not import by fuzzy name matching: the manifest already fixes each member UUID, number, exact current name and source row. The test Google row, unmatched people and closed/anonymized accounts are excluded.

Generate both scripts from the same approved manifest (replace the example private paths):

```sh
umask 077
node supabase/audits/member-composite-score-import.mjs /private/tmp/approved-manifest.json --mode dry-run > /private/tmp/composite-dry-run.sql
node supabase/audits/member-composite-score-import.mjs /private/tmp/approved-manifest.json --mode apply > /private/tmp/composite-apply.sql
```

Run the dry-run transaction in one connection with stop-on-error. Save its returned `composite_import_result` privately **before** executing apply. It includes the canonical manifest/source SHA-256, 55 original member A values, timestamps, interview metadata, previous shared rows, and protected-table count/hash baselines. It exercises actual score/mirror/audit triggers, checks all 220 score values, then rolls back. PostgreSQL identity sequences can have gaps after rollback; no score/audit rows remain.

Inspect dry-run: `status=applied`, `written_members=55`, `written_score_values=220`, `currently_identical_members=55`, `audit_rows_added=55`, and identical protected before/after hashes. Then run the complete apply transaction and retain its result plus evidence that COMMIT succeeded. A returned SELECT alone is not proof of COMMIT. Re-read the 55 score rows, A mirrors and batch audit records after commit. Both scripts reacquire member locks and recheck identities, account state, existing A and shared values. Any intervening incompatible change aborts the whole import.

Retries use the batch's 55 immutable historical import events and the canonical manifest hash. A complete identical batch returns `already_applied` with zero writes, even after an administrator has edited scores. Changed or partial batch evidence raises an error. Never change the batch ID merely to bypass this guard.

The transaction compares all historical evaluation rows (all 17 dimensions, notes, interviewers and dates), identities, `public.community_notifications` and members before/after. Only the target members' A and `updated_at` are exempted. REPEATABLE READ keeps concurrent unrelated activity out of these comparisons; row locks and serialization failures protect targeted changes. No interview evaluations are created. No notification APIs or dispatchers are called.

Rollback evidence is retained in `target_before` and `private.member_composite_score_audit.before_values`. A rollback is a separately reviewed transaction: lock these same members, verify their current rows still equal the import audit `after_values` including `updated_at`, and restore only the imported four values and A from the saved baseline. If a member has a later admin edit, stop rather than overwrite it. Newly inserted shared rows may be removed only with an explicit matching A restore (the normal mirror trigger runs on INSERT/UPDATE, not DELETE); preserve import audit history and record the rollback reason. Do not reset member timestamps or restore whole member rows over unrelated edits.

Local checks, with an already installed PGlite module:

```sh
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/audits/member-composite-score-import-pglite.mjs
```

The fixture uses the real composite score migration and triggers. It tests successful 55/220 import, dry-run rollback, duplicate manifest rejection, identity/account drift, new admin values, empty shared rows, accidental evaluation/notification effects, partial batches, safe retries and later admin edits.
