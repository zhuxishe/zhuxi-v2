// Execute real PostgreSQL tables, policies, functions and the pending migration.
// PGLITE_MODULE may point to an existing @electric-sql/pglite installation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
process.on('uncaughtException', error => { console.error(error.message, error.where || '', error.internalQuery || ''); process.exit(1) })
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + path, 'utf8')
const base = read('supabase/migrations/20260716165130_community_v1_schema.sql')
const db = new PGlite()
function table(name) {
  const start = base.indexOf(`CREATE TABLE ${name} (`)
  assert.ok(start >= 0, name)
  return base.slice(start, base.indexOf('\n);', start) + 3)
}
function fn(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  assert.ok(start >= 0, name)
  const definition = source.slice(start)
  const match = /AS (\$[a-z_]*\$)/i.exec(definition)
  assert.ok(match, name)
  const end = definition.indexOf(match[1] + ';', match.index + match[0].length)
  return definition.slice(0, end + match[1].length + 1)
}
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  CREATE TABLE public.members(id uuid PRIMARY KEY, user_id uuid, status text DEFAULT 'approved', account_status text DEFAULT 'active', anonymized_at timestamptz);
  CREATE TABLE public.admin_users(id uuid PRIMARY KEY, user_id uuid, role text);
  CREATE TABLE public.community_reports(id uuid PRIMARY KEY);
  CREATE TABLE public.community_announcements(id uuid PRIMARY KEY);
  CREATE TABLE public.match_rounds(id uuid PRIMARY KEY);
  CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at = now(); RETURN NEW; END$$;
  GRANT USAGE ON SCHEMA public, auth, private TO authenticated, anon, service_role;
`)
for (const name of [
  'public.community_profiles', 'private.community_profile_members', 'public.community_posts',
  'private.community_post_authors', 'public.community_comments', 'private.community_comment_authors',
  'public.community_likes', 'public.community_blocks', 'public.community_user_hides',
  'public.community_sanctions', 'public.community_notifications', 'public.community_notification_preferences',
]) await db.exec(table(name))
for (const name of [
  'private.community_approved_member_id', 'private.community_current_profile_id',
  'private.community_current_admin_id', 'private.community_is_admin',
  'private.community_can_read', 'private.community_can_interact',
  'private.community_member_for_profile', 'private.community_post_author_member',
  'private.community_comment_author_member', 'private.community_profile_is_hidden_by_current',
  'private.community_interaction_is_blocked', 'private.community_notification_interaction_blocked',
  'private.community_post_visible_to_current', 'private.community_comment_visible_to_current',
  'private.community_notification_enabled', 'private.community_insert_notification',
  'private.community_notify_like', 'private.community_refresh_post_counts',
  'public.community_toggle_post_like',
]) await db.exec(fn(base, name))
await db.exec(read('supabase/migrations/20260831234821_fix_member_readonly_authorization_lock.sql'))
const notificationChange = read('supabase/migrations/20260929142902_round_submission_notifications.sql')
await db.exec(notificationChange.slice(notificationChange.indexOf('ALTER TABLE'), notificationChange.indexOf('CREATE UNIQUE INDEX')))
await db.exec(`
  ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
  CREATE POLICY community_comments_member_read ON public.community_comments FOR SELECT TO authenticated USING (private.community_comment_visible_to_current(id));
  ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
  CREATE POLICY community_notifications_self_read ON public.community_notifications FOR SELECT TO authenticated USING (recipient_member_id = private.community_approved_member_id());
  GRANT SELECT ON public.community_comments, public.community_notifications TO authenticated;
  CREATE TRIGGER community_likes_refresh_count AFTER INSERT OR DELETE ON public.community_likes FOR EACH ROW EXECUTE FUNCTION private.community_refresh_post_counts();
  CREATE TRIGGER community_likes_notify AFTER INSERT ON public.community_likes FOR EACH ROW EXECUTE FUNCTION private.community_notify_like();
  CREATE TRIGGER community_comments_refresh_count AFTER INSERT OR UPDATE OF status OR DELETE ON public.community_comments FOR EACH ROW EXECUTE FUNCTION private.community_refresh_post_counts();
`)
await db.exec(read('supabase/migrations/20261002153140_community_comment_likes.sql'))
const uuid = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const member = n => uuid(1, n), user = n => uuid(2, n), profile = n => uuid(3, n)
const post = n => uuid(4, n), comment = n => uuid(5, n)
for (let n = 1; n <= 10; n++) {
  await db.query('INSERT INTO public.members(id,user_id) VALUES($1,$2)', [member(n), user(n)])
  await db.query('INSERT INTO public.community_profiles(id,nickname) VALUES($1,$2)', [profile(n), 'Member ' + n])
  await db.query('INSERT INTO private.community_profile_members(profile_id,member_id) VALUES($1,$2)', [profile(n), member(n)])
}
async function newPost(n, owner = 1, anonymous = false, type = 'treehole') {
  await db.exec('BEGIN')
  await db.query('INSERT INTO public.community_posts(id,post_type,author_profile_id,is_anonymous,body) VALUES($1,$2,$3,$4,$5)', [post(n), type, anonymous ? null : profile(owner), anonymous, 'Fixture post'])
  await db.query('INSERT INTO private.community_post_authors(post_id,member_id) VALUES($1,$2)', [post(n), member(owner)])
  await db.exec('COMMIT')
}
async function newComment(n, postNumber = 1, owner = 2, parent = null, anonymous = false) {
  await db.exec('BEGIN')
  await db.query('INSERT INTO private.community_comment_authors(comment_id,member_id) VALUES($1,$2)', [comment(n), member(owner)])
  await db.query('INSERT INTO public.community_comments(id,post_id,parent_comment_id,author_profile_id,is_anonymous_author,body) VALUES($1,$2,$3,$4,$5,$6)', [comment(n), post(postNumber), parent ? comment(parent) : null, anonymous ? null : profile(owner), anonymous, 'Fixture comment'])
  await db.exec('COMMIT')
}
async function asMember(n, operation, role = 'authenticated', readOnly = false) {
  await db.exec(readOnly ? 'BEGIN READ ONLY' : 'BEGIN')
  try {
    await db.exec('SET LOCAL ROLE ' + role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [n ? user(n) : ''])
    const result = await operation()
    await db.exec('COMMIT')
    return result
  } catch (error) {
    await db.exec('ROLLBACK')
    throw error
  }
}
const like = (n, target, liked = true) => asMember(n, () => db.query('SELECT * FROM public.community_set_comment_like($1,$2)', [comment(target), liked])).then(result => result.rows[0])
const states = (n, targets) => asMember(n, () => db.query('SELECT * FROM public.community_get_comment_like_states($1)', [targets.map(comment)])).then(result => result.rows)
const notices = async target => (await db.query("SELECT * FROM public.community_notifications WHERE notification_type='comment_like' AND comment_id=$1", [comment(target)])).rows
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }
await newPost(1)
await newPost(2, 1, false, 'photo')
await newPost(3, 1, true)
await newComment(1)
await newComment(2, 1, 3, 1)
await newComment(3, 2)
await newComment(4, 2, 3, 3)
await newComment(5, 3, 1, null, true)

await check('treehole/photo root comments and child replies can each be liked', async () => {
  for (const target of [1, 2, 3, 4, 5]) assert.deepEqual(await like(4, target), { liked: true, like_count: 1, like_version: 1 })
})
await check('target-state writes are idempotent and can be cancelled', async () => {
  assert.deepEqual(await like(4, 1), { liked: true, like_count: 1, like_version: 1 })
  assert.deepEqual(await like(4, 1, false), { liked: false, like_count: 0, like_version: 2 })
  assert.deepEqual(await like(4, 1, false), { liked: false, like_count: 0, like_version: 2 })
  assert.deepEqual(await like(4, 1), { liked: true, like_count: 1, like_version: 3 })
})
await check('many distinct likes update one notice, preserve time/read state, never expose actor', async () => {
  const before = (await notices(2))[0]
  await db.query('UPDATE public.community_notifications SET read_at=now() WHERE id=$1', [before.id])
  const marked = (await notices(2))[0]
  await like(5, 2); await like(6, 2)
  const after = await notices(2)
  assert.equal(after.length, 1); assert.equal(after[0].id, before.id)
  assert.equal(after[0].group_count, 3); assert.equal(after[0].actor_profile_id, null)
  assert.deepEqual(after[0].created_at, before.created_at); assert.deepEqual(after[0].read_at, marked.read_at)
  assert.deepEqual(after[0].expires_at, before.expires_at)
  assert.equal(after[0].comment_id, comment(2)); assert.equal(after[0].post_id, post(1))
})
await check('self-likes count publicly but do not create or inflate a received notification', async () => {
  await newComment(6, 1, 2)
  assert.deepEqual(await like(2, 6), { liked: true, like_count: 1, like_version: 1 })
  assert.equal((await notices(6)).length, 0)
  await like(3, 6)
  assert.equal((await notices(6))[0].group_count, 1)
  await like(2, 6, false)
  assert.equal((await notices(6))[0].group_count, 1)
})
await check('cancel all likes retains one hidden read tombstone; re-like cannot spam unread', async () => {
  for (const n of [4, 5, 6]) await like(n, 2, false)
  const zero = (await notices(2))[0]
  assert.equal(zero.group_count, 0); assert.ok(zero.read_at)
  await like(4, 2)
  const after = (await notices(2))[0]
  assert.equal(after.id, zero.id); assert.equal(after.group_count, 1); assert.deepEqual(after.read_at, zero.read_at)
})
await check('likes preferences suppress new comment-like notices', async () => {
  await db.query('INSERT INTO public.community_notification_preferences(member_id,likes_enabled) VALUES($1,false)', [member(2)])
  await newComment(7)
  await like(4, 7)
  assert.equal((await notices(7)).length, 0)
  await db.query('UPDATE public.community_notification_preferences SET likes_enabled=true WHERE member_id=$1', [member(2)])
})
await check('post likes and different comments never share a notification group', async () => {
  await asMember(4, () => db.query('SELECT * FROM public.community_toggle_post_like($1)', [post(1)]))
  const result = await db.query("SELECT notification_type,comment_id FROM public.community_notifications WHERE post_id=$1", [post(1)])
  assert.ok(result.rows.some(row => row.notification_type === 'like' && row.comment_id === null))
  assert.ok(result.rows.filter(row => row.notification_type === 'comment_like').length > 1)
})
await check('only own reaction records are readable; direct writes and private helpers are denied', async () => {
  const own = await asMember(4, () => db.query('SELECT * FROM public.community_comment_likes'))
  assert.ok(own.rows.length > 0); assert.ok(own.rows.every(row => row.member_id === member(4)))
  await assert.rejects(asMember(4, () => db.query('INSERT INTO public.community_comment_likes(comment_id,member_id) VALUES($1,$2)', [comment(6), member(5)])), /permission denied/)
  await assert.rejects(asMember(4, () => db.exec('DELETE FROM public.community_comment_likes')), /permission denied/)
  await assert.rejects(asMember(null, () => db.exec('SELECT * FROM public.community_comment_likes'), 'anon'), /permission denied/)
  await assert.rejects(asMember(4, () => db.query('SELECT private.community_sync_comment_likes($1,true)', [comment(1)])), /permission denied/)
})
await check('anonymous/unapproved/closed/suspended/anonymized/muted/banned accounts cannot react', async () => {
  await assert.rejects(asMember(null, () => db.query('SELECT * FROM public.community_set_comment_like($1,true)', [comment(1)]), 'anon'), /permission denied/)
  await assert.rejects(like(null, 1), /NOT_ALLOWED/)
  for (const set of ["status='pending'", "account_status='closed'", "account_status='suspended'"]) {
    await db.query('UPDATE public.members SET ' + set + ' WHERE id=$1', [member(8)])
    await assert.rejects(like(8, 1), /NOT_ALLOWED/)
    await db.query("UPDATE public.members SET status='approved',account_status='active' WHERE id=$1", [member(8)])
  }
  for (const type of ['mute', 'permanent_ban']) {
    await db.query("INSERT INTO public.community_sanctions(member_id,sanction_type,reason,starts_at,ends_at) VALUES($1,$2,'Fixture restriction',now()-interval '1 hour',CASE WHEN $2='mute' THEN now()+interval '1 day' ELSE NULL END)", [member(8), type])
    await assert.rejects(like(8, 1), /NOT_ALLOWED/)
    await db.query('DELETE FROM public.community_sanctions WHERE member_id=$1', [member(8)])
  }
})
await check('hidden/deleted comments and unavailable posts reject reactions', async () => {
  await newComment(8)
  for (const state of ['hidden', 'deleted']) {
    await db.query("UPDATE public.community_comments SET status=$2,hidden_at=now(),deleted_at=now() WHERE id=$1", [comment(8), state])
    await assert.rejects(like(4, 8), /UNAVAILABLE/)
  }
  await db.query("UPDATE public.community_posts SET status='hidden',hidden_at=now() WHERE id=$1", [post(2)])
  await assert.rejects(like(4, 3), /UNAVAILABLE/)
  await db.query("UPDATE public.community_posts SET status='published',hidden_at=null WHERE id=$1", [post(2)])
  await assert.rejects(like(4, 999), /UNAVAILABLE/)
  await assert.rejects(asMember(4, () => db.query('SELECT * FROM public.community_set_comment_like($1,null)', [comment(1)])), /INVALID/)
})
await check('public block is enforced but anonymous-owner block cannot reveal authors via failure', async () => {
  await db.query('INSERT INTO public.community_blocks(blocker_member_id,blocked_profile_id) VALUES($1,$2)', [member(1), profile(4)])
  await assert.rejects(like(4, 1), /UNAVAILABLE/)
  assert.equal((await like(4, 5, false)).liked, false)
  assert.equal((await like(4, 5)).liked, true)
  assert.equal((await notices(5))[0].group_count, 1)
  await db.query('DELETE FROM public.community_blocks WHERE blocker_member_id=$1', [member(1)])
  await db.query('INSERT INTO public.community_blocks(blocker_member_id,blocked_profile_id) VALUES($1,$2)', [member(2), profile(4)])
  await assert.rejects(like(4, 1), /UNAVAILABLE/)
  await db.query('DELETE FROM public.community_blocks WHERE blocker_member_id=$1', [member(2)])
})
await check('notification headcount cannot expose liker identities by changing block lists', async () => {
  const before = (await notices(1))[0].group_count
  await db.query('INSERT INTO public.community_blocks(blocker_member_id,blocked_profile_id) VALUES($1,$2)', [member(2), profile(4)])
  await like(5, 1)
  assert.equal((await notices(1))[0].group_count, before + 1)
  await db.query('DELETE FROM public.community_blocks WHERE blocker_member_id=$1', [member(2)])
  await like(5, 1, false)
})
await check('anonymous owner liking a reply never stores their profile in the notice', async () => {
  await newComment(9, 3, 2, 5)
  await like(1, 9)
  assert.equal((await notices(9))[0].actor_profile_id, null)
})
await check('moderation hides existing notice and restoring content does not create another', async () => {
  const initial = (await notices(3))[0]
  await db.query("UPDATE public.community_comments SET status='hidden',hidden_at=now() WHERE id=$1", [comment(3)])
  const hidden = (await notices(3))[0]
  assert.equal(hidden.group_count, 0); assert.ok(hidden.read_at)
  assert.equal((await notices(4))[0].group_count, 0)
  await assert.rejects(like(5, 4), /UNAVAILABLE/)
  assert.deepEqual(await states(4, [3, 4]), [])
  await db.query("UPDATE public.community_comments SET status='published',hidden_at=null WHERE id=$1", [comment(3)])
  assert.equal((await notices(3))[0].id, initial.id)
  assert.deepEqual((await notices(3))[0].read_at, hidden.read_at)
  assert.equal((await notices(4))[0].group_count, 1)
})
await check('batch state RPC returns one consistent own-state/count/version snapshot with visibility checks', async () => {
  const current = (await states(4, [1]))[0]
  const own = await like(4, 1)
  assert.deepEqual(current, { comment_id: comment(1), ...own })
  const readOnly = await asMember(4, () => db.query('SELECT * FROM public.community_get_comment_like_states($1)', [[comment(1)]]), 'authenticated', true)
  assert.deepEqual(readOnly.rows, [current])
  assert.equal((await states(7, [1]))[0].liked, false)
  assert.deepEqual(await states(4, [8, 999]), [])
  assert.deepEqual(await states(4, []), [])
  await db.query("UPDATE public.community_comments SET status='deleted',deleted_at=now() WHERE id=$1", [comment(3)])
  assert.deepEqual((await states(4, [3, 4])).map(row => row.comment_id), [comment(4)])
  await db.query("UPDATE public.community_comments SET status='published',deleted_at=null WHERE id=$1", [comment(3)])
  await assert.rejects(states(4, Array(1001).fill(1)), /BATCH_TOO_LARGE/)
  await assert.rejects(states(null, [1]), /NOT_ALLOWED/)
  await assert.rejects(asMember(null, () => db.query('SELECT * FROM public.community_get_comment_like_states($1)', [[comment(1)]]), 'anon'), /permission denied/)
})
await check('post hidden/deleted/restored updates all comment notices without resending', async () => {
  const original = (await notices(4))[0]
  for (const status of ['hidden', 'deleted']) {
    await db.query('UPDATE public.community_posts SET status=$2,hidden_at=now(),deleted_at=now() WHERE id=$1', [post(2), status])
    for (const target of [3, 4]) {
      const hidden = (await notices(target))[0]
      assert.equal(hidden.group_count, 0); assert.ok(hidden.read_at)
    }
    await db.query("UPDATE public.community_posts SET status='published',hidden_at=null,deleted_at=null WHERE id=$1", [post(2)])
    const restored = (await notices(4))[0]
    assert.equal(restored.id, original.id); assert.equal(restored.group_count, 1)
    assert.deepEqual(restored.created_at, original.created_at); assert.ok(restored.read_at)
  }
})
await check('member anonymization removes their votes, recalculates counts, blocks new votes', async () => {
  await newComment(13, 1, 8)
  await like(7, 13)
  assert.equal((await notices(13)).length, 1)
  await like(8, 1); await like(8, 4)
  const before = (await db.query('SELECT like_count FROM public.community_comments WHERE id=$1', [comment(1)])).rows[0].like_count
  await db.query("UPDATE public.members SET anonymized_at=now(),account_status='closed',user_id=null WHERE id=$1", [member(8)])
  assert.equal((await db.query('SELECT * FROM public.community_comment_likes WHERE member_id=$1', [member(8)])).rows.length, 0)
  assert.equal((await db.query('SELECT like_count FROM public.community_comments WHERE id=$1', [comment(1)])).rows[0].like_count, before - 1)
  assert.equal((await notices(13)).length, 0)
  await assert.rejects(like(8, 1), /NOT_ALLOWED/)
})
await check('member physical deletion cascades votes and recounts other members comments', async () => {
  await like(9, 1)
  const before = (await db.query('SELECT like_count FROM public.community_comments WHERE id=$1', [comment(1)])).rows[0].like_count
  await db.query('DELETE FROM public.members WHERE id=$1', [member(9)])
  assert.equal((await db.query('SELECT like_count FROM public.community_comments WHERE id=$1', [comment(1)])).rows[0].like_count, before - 1)
})
await check('comment physical deletion cascades reactions without blocking existing cleanup', async () => {
  await newComment(10)
  await like(4, 10)
  const notice = (await notices(10))[0]
  await db.query('DELETE FROM public.community_comments WHERE id=$1', [comment(10)])
  assert.equal((await db.query('SELECT * FROM public.community_comment_likes WHERE comment_id=$1', [comment(10)])).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM public.community_notifications WHERE id=$1', [notice.id])).rows.length, 0)
})
await check('post physical deletion cascades root/reply votes and removes their notifications', async () => {
  await newPost(4)
  await newComment(11, 4)
  await newComment(12, 4, 3, 11)
  await like(4, 11); await like(4, 12)
  const ids = [...await notices(11), ...await notices(12)].map(row => row.id)
  assert.equal(ids.length, 2)
  await db.query('DELETE FROM public.community_posts WHERE id=$1', [post(4)])
  assert.equal((await db.query('SELECT * FROM public.community_comments WHERE post_id=$1', [post(4)])).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM public.community_comment_likes WHERE comment_id=ANY($1)', [[comment(11), comment(12)]])).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM public.community_notifications WHERE id=ANY($1)', [ids])).rows.length, 0)
})
await check('existing notification kinds still validate, ordinary groups cannot have zero', async () => {
  for (const type of ['registration_submitted', 'matching_submitted', 'like', 'reply', 'comment']) {
    await db.query('INSERT INTO public.community_notifications(recipient_member_id,notification_type) VALUES($1,$2)', [member(1), type])
  }
  await assert.rejects(db.query("INSERT INTO public.community_notifications(recipient_member_id,notification_type,group_count) VALUES($1,'like',0)", [member(1)]), /group_count_check/)
})
console.log(`${passed} real PostgreSQL comment-like checks passed (PGlite is single-session; no multi-connection race simulation).`)
await db.close()
