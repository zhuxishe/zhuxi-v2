// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (file) => readFileSync(root + file, 'utf8')
const db = new PGlite()
const master = read('supabase/migrations/20260829175645_user_member_master_v1.sql')
const extract = (name) => { const start = master.indexOf('CREATE OR REPLACE FUNCTION ' + name); return master.slice(start, master.indexOf('$function$;', start) + 12) }
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('role', current_setting('request.jwt.claim.role',true))$$;
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY, role text);
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb);
CREATE TABLE public.members(id uuid PRIMARY KEY, user_id uuid, email text, status text, profile_stage text, record_source text, record_scope text,
 onboarding_step integer, last_profile_saved_at timestamptz, submitted_at timestamptz, created_at timestamptz, updated_at timestamptz, member_number text, account_status text);
CREATE TABLE public.member_identity(member_id uuid PRIMARY KEY, full_name text, nickname text, school_name text);
CREATE TABLE public.legacy_members(id uuid PRIMARY KEY, canonical_member_id uuid, full_name text, school text, member_no text, created_at timestamptz);
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
INSERT INTO public.admin_users VALUES ('00000000-0000-0000-0000-000000000001','super_admin'),('00000000-0000-0000-0000-000000000002','admin');`)
await db.exec(extract('private.member_master_is_admin()'))
await db.exec(extract('private.member_master_is_super_admin()'))
await db.exec(extract('public.admin_list_member_directory('))
await db.exec(read('supabase/migrations/20261002151147_member_directory_filters.sql'))
const id = (n) => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const names = ['早稲田大学','早稻田大学','東京科学大学','東京工業大学','自定义学院',null]
const numbers = ['竹溪社-2','竹溪社-10','zxs-001',null,'X-03',null]
for (let n=1;n<=66;n++) {
  await db.query(`INSERT INTO public.members(id,user_id,email,status,profile_stage,record_source,record_scope,created_at,updated_at,member_number,account_status)
   VALUES($1,$1,'fixture@test.local',$2,'complete','app',$3,'2026-01-01'::timestamptz+$4*interval '1 minute','2026-02-01'::timestamptz-$4*interval '1 minute',$5,$6)`,
  [id(n),n===65?'pending':'approved',n===66?'historical':'current',n,n<=6?numbers[n-1]:null,n===64?'suspended':'active'])
  await db.query('INSERT INTO public.member_identity VALUES($1,$2,NULL,$3)',[id(n),'测试'+n,n<=6?names[n-1]:'早稻田大学'])
}
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log('PASS '+name) }
async function directory(options={}, role='authenticated', admin=1) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE '+role)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[`00000000-0000-0000-0000-${String(admin).padStart(12,'0')}`,role])
    const result = await db.query(`SELECT public.admin_list_member_directory_filtered($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result`,
      [options.page??1,options.size??50,options.search??null,options.status??null,'active',null,null,options.schools??null,options.sort??'default',options.order??'default'])
    return result.rows[0].result
  } finally { await db.exec('ROLLBACK') }
}
await check('exact canonical aliases match every supported university',async()=>{
 for (const school of JSON.parse(read('src/data/universities.json'))) for (const alias of Object.values(school)) {
   assert.equal((await db.query('SELECT private.member_directory_school_name($1) AS name',[alias])).rows[0].name,school.zh)
 }
 assert.equal((await db.query("SELECT private.member_directory_school_name('未知学校') AS name")).rows[0].name,'未知学校')
})
await check('default ordering and school counts span all pages, omit historical/suspended',async()=>{
 const first=await directory(), second=await directory({page:2})
 assert.equal(first.total,64); assert.equal(first.items.length,50); assert.equal(second.items.length,14)
 assert.equal(first.items[0].member_id,id(65)); assert.equal(second.items.at(-1).member_id,id(1))
 assert.equal(new Set([...first.items,...second.items].map(x=>x.member_id)).size,64)
 assert.deepEqual(first.schools,second.schools)
 assert.equal(first.schools.find(x=>x.value==='早稻田大学').count,60)
})
await check('single/multi school filters, old aliases and missing school',async()=>{
 assert.deepEqual((await directory({schools:['东京科学大学']})).items.map(x=>x.member_id),[id(4),id(3)])
 assert.equal((await directory({schools:['早稲田大学','東京工業大学']})).total,62)
 assert.deepEqual((await directory({schools:['']})).items.map(x=>x.member_id),[id(6)])
 const empty=await directory({schools:['不存在']}); assert.equal(empty.total,0); assert.equal(empty.items.length,0); assert.equal(empty.schools.length,4)
})
await check('school counts respect other filters but not the current school selection',async()=>{
 const result=await directory({status:'approved',schools:['东京科学大学']})
 assert.equal(result.total,2); assert.equal(result.schools.find(x=>x.value==='早稻田大学').count,59)
 const searched=await directory({search:'测试3'}); assert.equal(searched.total,11)
 assert.equal(searched.schools.reduce((sum,x)=>sum+x.count,0),11)
})
await check('updated sorting is global, ascending and descending',async()=>{
 assert.equal((await directory({sort:'updated_asc'})).items[0].member_id,id(65))
 assert.equal((await directory({sort:'updated_desc'})).items[0].member_id,id(1))
 assert.equal((await directory({sort:'updated_desc',page:2})).items[0].member_id,id(51))
})
await check('natural member numbers across prefixes, missing numbers last in both directions',async()=>{
 assert.deepEqual((await directory({sort:'number_asc'})).items.slice(0,5).map(x=>x.member_number),['zxs-001','竹溪社-2','X-03','竹溪社-10',null])
 assert.deepEqual((await directory({sort:'number_desc'})).items.slice(0,5).map(x=>x.member_number),['竹溪社-10','X-03','竹溪社-2','zxs-001',null])
})
await check('school group priority and within-school sorting persist across pages',async()=>{
 const all=await directory({order:'count_desc',sort:'number_asc',size:100})
 assert.equal(all.items[0].school_name,'早稻田大学'); assert.equal(all.items[0].member_number,'竹溪社-2')
 assert.equal(all.items[59].school_name,'早稻田大学'); assert.equal(all.items[60].school_name,'东京科学大学')
 assert.equal(all.items.at(-1).school_name,null)
 const asc=await directory({order:'name_asc',size:100}), desc=await directory({order:'name_desc',size:100})
 assert.equal(asc.items[0].school_name,'东京科学大学'); assert.equal(desc.items[0].school_name,'自定义学院')
 assert.equal(desc.items.at(-1).school_name,null)
})
await check('ordinary admin cannot infer hidden member numbers through sorting',async()=>{
 const normal=await directory({},'authenticated',2), sorted=await directory({sort:'number_asc'},'authenticated',2)
 assert.deepEqual(normal.items,sorted.items)
 assert.ok(sorted.items.every(x=>x.member_number===null && x.auth_email===null))
 assert.ok(sorted.redacted_fields.includes('member_number'))
})
await check('anonymous and non-admin callers denied; invalid input rejected',async()=>{
 await assert.rejects(directory({},'anon'),/permission denied/)
 await assert.rejects(directory({},'authenticated',3),/ADMIN_REQUIRED/)
 await assert.rejects(directory({sort:'injected'}),/FILTER_INVALID/)
 await assert.rejects(directory({page:0}),/PAGINATION_INVALID/)
})
await check('original RPC still works and rows were not rewritten',async()=>{
 await db.query("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)")
 assert.ok((await db.query('SELECT public.admin_list_member_directory() AS result')).rows[0].result.items.length)
 assert.equal((await db.query('SELECT count(*)::int AS count FROM public.members')).rows[0].count,66)
 assert.equal((await db.query('SELECT school_name FROM public.member_identity WHERE member_id=$1',[id(4)])).rows[0].school_name,'東京工業大学')
})
console.log(`${passed} database checks passed`)
await db.close()
