// Isolated PostgreSQL verification; never connects to or changes live accounts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
process.on('uncaughtException', error => { console.error(error.message, error.where || '', error.internalQuery || ''); process.exit(1) })
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => readFileSync(root + path, 'utf8')
const community = read('supabase/migrations/20260716165130_community_v1_schema.sql')
const profile = read('supabase/migrations/20260717133952_player_profile_v1.sql')
const db = new PGlite()
function table(name) {
  const start = community.indexOf(`CREATE TABLE ${name} (`)
  assert.ok(start >= 0, name)
  return community.slice(start, community.indexOf('\n);', start) + 3)
}
function fn(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  assert.ok(start >= 0, name)
  const definition = source.slice(start)
  const delimiter = /AS (\$[a-z_]*\$)/i.exec(definition)
  assert.ok(delimiter, name)
  const end = definition.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length)
  return definition.slice(0, end + delimiter[1].length + 1)
}
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE TABLE public.members(id uuid PRIMARY KEY, user_id uuid, status text DEFAULT 'approved', account_status text DEFAULT 'active', anonymized_at timestamptz);
  CREATE TABLE public.admin_users(id uuid PRIMARY KEY, user_id uuid, name text);
  CREATE TABLE public.member_identity(member_id uuid PRIMARY KEY REFERENCES public.members(id), full_name text, gender text, nickname text, school_name text, department text, personal_avatar_path text);
  CREATE TABLE public.community_sanctions(member_id uuid, sanction_type text, revoked_at timestamptz, starts_at timestamptz);
  GRANT USAGE ON SCHEMA public, private, auth TO anon, authenticated, service_role;
`)
for (const name of ['public.community_profiles', 'private.community_profile_members', 'public.community_nickname_history']) await db.exec(table(name))
await db.exec(read('supabase/migrations/20260831234821_fix_member_readonly_authorization_lock.sql'))
for (const name of ['private.community_current_admin_id', 'private.community_can_read', 'private.community_log_nickname_change']) await db.exec(fn(community, name))
for (const name of [
  'private.profile_normalize_nickname', 'private.profile_current_admin_id',
  'private.profile_validate_identity_fields', 'private.profile_sync_identity_to_community',
  'private.profile_sync_community_to_identity', 'private.profile_sync_new_community_mapping',
  'public.community_upsert_profile', 'public.update_my_profile',
]) await db.exec(fn(profile, name))
// Optionally test the exact read-only production function snapshot as well.
if (process.env.NICKNAME_BASELINE_JSON) {
  const snapshot = JSON.parse(readFileSync(process.env.NICKNAME_BASELINE_JSON, 'utf8')).rows[0].preflight
  for (const definition of Object.values(snapshot.functions)) await db.exec(definition)
}
await db.exec(`
  CREATE FUNCTION public.get_my_profile_summary() RETURNS jsonb LANGUAGE sql AS $$SELECT to_jsonb(i) FROM public.member_identity i JOIN public.members m ON m.id=i.member_id WHERE m.user_id=auth.uid()$$;
  CREATE UNIQUE INDEX member_identity_nickname_normalized_uidx ON public.member_identity(lower(private.profile_normalize_nickname(nickname))) WHERE nickname IS NOT NULL;
  CREATE UNIQUE INDEX community_profiles_nickname_normalized_uidx ON public.community_profiles(nickname_normalized);
  ALTER TABLE public.member_identity ADD CONSTRAINT member_identity_nickname_shape CHECK (nickname IS NULL OR (nickname=private.profile_normalize_nickname(nickname) AND char_length(nickname) BETWEEN 2 AND 20 AND lower(nickname) NOT IN ('admin','administrator','staff','官方','管理员','竹溪社官方','管理者','運営','公式')));
  CREATE TRIGGER member_identity_validate_profile_fields BEFORE INSERT OR UPDATE OF nickname, personal_avatar_path ON public.member_identity FOR EACH ROW EXECUTE FUNCTION private.profile_validate_identity_fields();
  CREATE TRIGGER member_identity_sync_community_profile AFTER UPDATE OF nickname, personal_avatar_path ON public.member_identity FOR EACH ROW EXECUTE FUNCTION private.profile_sync_identity_to_community();
  CREATE TRIGGER community_profiles_sync_member_identity AFTER UPDATE OF nickname, avatar_kind, avatar_path ON public.community_profiles FOR EACH ROW EXECUTE FUNCTION private.profile_sync_community_to_identity();
  CREATE TRIGGER community_profile_mapping_sync_identity AFTER INSERT OR UPDATE OF member_id ON private.community_profile_members FOR EACH ROW EXECUTE FUNCTION private.profile_sync_new_community_mapping();
  CREATE TRIGGER community_profiles_nickname_history AFTER UPDATE OF nickname ON public.community_profiles FOR EACH ROW EXECUTE FUNCTION private.community_log_nickname_change();
  ALTER TABLE public.member_identity ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, UPDATE ON public.member_identity, public.community_profiles TO service_role;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.community_upsert_profile(text,text,text,text), public.update_my_profile(text,text,text,text,text,text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.community_upsert_profile(text,text,text,text), public.update_my_profile(text,text,text,text,text,text) TO authenticated;
`)
const uuid = (kind, n) => `${kind}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const user = n => uuid(1, n), member = n => uuid(2, n)
const emails = ['zhuxishe@gmail.com', 'tsyronjp@gmail.com', 'tokyojht4@gmail.com', 'ordinary@example.com', 'zhuxishe@gmail.com', 'forged@example.com', 'zhuxishe+test@gmail.com']
for (let n = 1; n <= emails.length; n++) {
  await db.query('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,$3,$4)', [user(n), emails[n-1], n === 5 ? null : new Date().toISOString(), n === 6 ? { email: emails[0], official: true } : {}])
  await db.query('INSERT INTO public.members(id,user_id) VALUES($1,$2)', [member(n), user(n)])
  await db.query('INSERT INTO public.member_identity(member_id,full_name,gender,nickname) VALUES($1,$2,$3,$4)', [member(n), 'Fixture member', 'other', 'Member ' + n])
}
await db.query('INSERT INTO public.admin_users(id,user_id,name) VALUES($1,$2,$3)', [uuid(3, 4), user(4), 'Ordinary admin'])
async function asUser(n, operation, role = 'authenticated') {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE ' + role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [n ? user(n) : '', JSON.stringify({ role, email: emails[0], user_metadata: { email: emails[0] } })])
    const result = await operation()
    await db.exec('COMMIT')
    return result
  } catch (error) { await db.exec('ROLLBACK'); throw error }
}
const saveCommunity = (n, nickname) => asUser(n, () => db.query("SELECT * FROM public.community_upsert_profile($1,'default',NULL,NULL)", [nickname]))
const saveProfile = (n, nickname) => asUser(n, () => db.query("SELECT public.update_my_profile('Fixture member','other',$1,NULL,NULL,NULL)", [nickname]))
async function assertSynced(n, nickname) {
  const result = await db.query('SELECT i.nickname AS identity_name, p.nickname AS community_name FROM public.member_identity i JOIN private.community_profile_members m ON m.member_id=i.member_id JOIN public.community_profiles p ON p.id=m.profile_id WHERE i.member_id=$1', [member(n)])
  assert.deepEqual(result.rows, [{ identity_name: nickname, community_name: nickname }])
}
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }
await check('baseline rejects official reserved names in both RPCs', async () => {
  await assert.rejects(saveCommunity(1, '官方'), /PROFILE_NICKNAME_RESERVED/)
  await assert.rejects(saveProfile(1, '官方'), /PROFILE_NICKNAME_RESERVED/)
})
await db.exec(read('supabase/migrations/20261002162521_official_nickname_exemptions.sql'))
for (let n = 1; n <= 3; n++) await check('official account ' + n + ' can create and edit both synchronized identities', async () => {
  for (const nickname of ['admin', 'administrator', 'staff', '官方', '管理员', '竹溪社官方', '管理者', '運営', '公式', ' ａｄｍｉｎ ']) {
    const normalized = nickname.normalize('NFKC').trim()
    await saveCommunity(n, nickname)
    await assertSynced(n, normalized)
    await saveProfile(n, 'Member ' + n)
    await assertSynced(n, 'Member ' + n)
    await saveProfile(n, nickname)
    await assertSynced(n, normalized)
    await saveCommunity(n, 'Member ' + n)
  }
})
for (let n = 4; n <= 7; n++) await check('non-exempt account ' + n + ' remains blocked despite forged JWT email/metadata', async () => {
  for (const nickname of ['竹溪社官方', ' ａｄｍｉｎ ', '管理者']) {
    await assert.rejects(saveCommunity(n, nickname), /PROFILE_NICKNAME_RESERVED/)
    await assert.rejects(saveProfile(n, nickname), /PROFILE_NICKNAME_RESERVED/)
  }
  await saveCommunity(n, 'Member ' + n)
  await assertSynced(n, 'Member ' + n)
})
await check('official accounts still obey length, avatar and unique-name checks', async () => {
  for (const nickname of ['竹', 'a'.repeat(21)]) {
    await assert.rejects(saveCommunity(1, nickname), /PROFILE_NICKNAME_INVALID/)
    await assert.rejects(saveProfile(1, nickname), /PROFILE_NICKNAME_INVALID/)
  }
  await assert.rejects(asUser(1, () => db.query("SELECT public.community_upsert_profile('官方','preset',NULL,'invalid')")), /Invalid preset avatar/)
  await saveCommunity(1, '官方')
  await assert.rejects(saveCommunity(2, '官方'), /PROFILE_NICKNAME_TAKEN/)
  await assert.rejects(saveProfile(2, '官方'), /PROFILE_NICKNAME_TAKEN/)
  await assertSynced(2, 'Member 2')
  await saveCommunity(1, 'Member 1')
})
await check('direct database writes validate the target owner, not the acting official account', async () => {
  await assert.rejects(asUser(1, () => db.query("UPDATE public.member_identity SET nickname='官方' WHERE member_id=$1", [member(4)]), 'service_role'), /PROFILE_NICKNAME_RESERVED/)
  const mapping = (await db.query('SELECT profile_id FROM private.community_profile_members WHERE member_id=$1', [member(4)])).rows[0]
  await assert.rejects(asUser(1, () => db.query("UPDATE public.community_profiles SET nickname='公式' WHERE id=$1", [mapping.profile_id]), 'service_role'), /PROFILE_NICKNAME_RESERVED/)
  await assertSynced(4, 'Member 4')
})
await check('email confirmation and current Auth email are checked on every save', async () => {
  await db.query("UPDATE auth.users SET email='former-official@example.com' WHERE id=$1", [user(1)])
  await assert.rejects(saveCommunity(1, '官方'), /PROFILE_NICKNAME_RESERVED/)
  await db.query('UPDATE auth.users SET email=$1,email_confirmed_at=NULL WHERE id=$2', [emails[0], user(1)])
  await assert.rejects(saveProfile(1, '官方'), /PROFILE_NICKNAME_RESERVED/)
  await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [user(1)])
})
await check('official accounts do not bypass inactive-account or community-ban checks', async () => {
  await db.query("UPDATE public.members SET account_status='closed' WHERE id=$1", [member(1)])
  await assert.rejects(saveCommunity(1, '官方'), /Approved community membership/)
  await assert.rejects(saveProfile(1, '官方'), /Approved player access/)
  await db.query("UPDATE public.members SET account_status='active' WHERE id=$1", [member(1)])
  await db.query("INSERT INTO public.community_sanctions(member_id,sanction_type,starts_at) VALUES($1,'permanent_ban',now())", [member(1)])
  await assert.rejects(saveCommunity(1, '官方'), /Approved community membership/)
})
await check('private exemption functions are not callable by API roles; ordinary users cannot write tables directly', async () => {
  const result = await db.query("SELECT has_function_privilege(role_name,'private.profile_member_can_use_reserved_nickname(uuid)','EXECUTE') AS allowed FROM (VALUES('anon'),('authenticated'),('service_role')) roles(role_name)")
  assert.ok(result.rows.every(row => row.allowed === false))
  await assert.rejects(asUser(4, () => db.query("UPDATE public.community_profiles SET nickname='官方'")), /permission denied/)
  await assert.rejects(asUser(null, () => db.query("SELECT public.community_upsert_profile('官方','default',NULL,NULL)"), 'anon'), /permission denied/)
})
await check('nickname history still records changes', async () => {
  assert.ok(Number((await db.query('SELECT count(*) AS count FROM public.community_nickname_history')).rows[0].count) > 0)
})
await db.close()
console.log(`PASS ${passed} database checks`)
