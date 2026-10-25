#!/usr/bin/env node
// Explicit, resumable operations; never run during deployment or application boot.
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUND = 'b17e1e9b-72d7-4bbb-b3bb-17486f6eebda'
const BATCH = 'tst-pool-20261025-v1'
const REAL = ['f049f125-e2c2-42ac-b0e7-096592c62d2b', '0bbeda0f-6c5b-49d0-bf06-c792c9ed1665', '9fc90347-548d-4999-b75a-d40c15e43716', 'a93fae7f-693b-4d6e-acd2-59e238cb0787', 'd9ba69fd-0039-4fcc-9002-591c3910feda', 'a43d5d7c-23e1-4a60-ac80-d94e516af186']
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const flags = Object.fromEntries(process.argv.slice(3).flatMap((s, i, a) => s.startsWith('--') ? [[s.slice(2), a[i + 1]?.startsWith('--') ? true : a[i + 1] ?? true]] : []))
const command = process.argv[2]
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const load = async p => JSON.parse(await readFile(p, 'utf8'))
function privatePath(p) { const a = resolve(p); assert(a !== ROOT && !a.startsWith(`${ROOT}/`), 'Private files must stay outside the repository'); return a }
async function save(p, value) {
  p = privatePath(p); await mkdir(dirname(p), { recursive: true, mode: 0o700 })
  const temporary = `${p}.${randomUUID()}.tmp`
  await writeFile(temporary, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); await rename(temporary, p)
}
async function privateLoad(p) { p = privatePath(p); assert(((await stat(p)).mode & 0o077) === 0, 'Private file must have mode 0600'); return load(p) }
function random(seed) { let n = createHash('sha256').update(seed).digest().readUInt32LE(); return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296 } }
function answers(template, member, previous = {}) {
  const rng = random(`${BATCH}:${member.code}:${template.kind}`), out = { ...previous }, index = Number(member.code.slice(4))
  for (const q of template.questions) {
    if (!q.active) continue
    const field = q.builtinField ?? q.id; let value
    if (['taboo_tags', 'deal_breakers'].includes(field)) value = []
    else if (q.type === 'single') {
      assert(q.options?.length, `No options for ${q.id}`); value = q.options[Math.floor(rng() * q.options.length)].value
      if (field === 'gender') value = index % 2 ? 'male' : 'female'
      if (['accept_beginners', 'accept_cross_school'].includes(field)) value = true
      if (['enrollment_year', 'graduation_year'].includes(field) || q.dimension) value = Number(value)
    } else if (q.type === 'multi') {
      const available = q.options.map(o => o.value), length = Math.min(available.length, q.maxSelections ?? available.length, 1 + Math.floor(rng() * 3)); value = []
      while (value.length < length) value.push(available.splice(Math.floor(rng() * available.length), 1)[0])
    } else if (['rating', 'number'].includes(q.type)) value = (q.min ?? 1) + Math.floor(rng() * ((q.max ?? 5) - (q.min ?? 1) + 1))
    else if (q.type === 'date') value = field === 'birth_date' ? `${1991 + index % 12}-${String(1 + index % 12).padStart(2, '0')}-${String(1 + index % 25).padStart(2, '0')}` : '2026-10-25'
    else {
      const text = { full_name: member.name, nickname: `测试${String(index).padStart(3, '0')}`, school_name: `测试大学${1 + index % 5}`, department: '测试学部', nearest_station: ['新宿', '池袋', '渋谷'][index % 3] }
      value = (text[field] ?? `合成测试资料${index}`).padEnd(q.min ?? 0, '测').slice(0, q.maxLength ?? 100)
    }
    out[q.id] = value
  }
  return out
}
function availability(start, end, code) {
  const rng = random(`${BATCH}:${code}:availability`), out = {}, slots = ['上午', '下午', '晚上']
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) {
    const mask = Math.floor(rng() * 8), selected = slots.filter((_, i) => mask & (1 << i)); if (selected.length) out[new Date(t).toISOString().slice(0, 10)] = selected
  }
  assert(Object.keys(out).length >= 5, 'Fixture must cover at least five dates'); return out
}
if (command === 'prepare') {
  assert(flags.preflight && flags.out, 'prepare --preflight FILE --out PRIVATE_FILE')
  const source = await load(flags.preflight), p = source.rows?.[0]?.preflight ?? source
  assert(p.round.id === ROUND && p.old_members.length === 27 && p.old_submissions.length === 27 && p.publications.length === 0, 'Unexpected original test pool')
  assert(p.real_members.length === 6 && p.real_members.every(m => REAL.includes(m.id)), 'Unexpected real participants')
  assert(p.old_members.every(m => m.user_id === null && m.account_status === 'unbound' && m.record_source === 'import' && m.record_scope === 'historical' && /^IMP-b17e1e9b-\d{3}$/.test(m.member_number)), 'Unexpected old member identity')
  try { await stat(flags.out); throw new Error('Manifest already exists: reuse its identities and passwords') } catch (e) { if (e.code !== 'ENOENT') throw e }
  const accounts = Array.from({ length: 27 }, (_, i) => {
    const suffix = String(i + 1).padStart(3, '0'), code = `TST_${suffix}`, name = `TST${suffix}（测试）`
    return { code, member_id: randomUUID(), name, email: `zhuxi-tst-${suffix}@example.invalid`, password: randomBytes(27).toString('base64url'),
      questionnaire_answers: Object.fromEntries(p.templates.map(t => [t.kind, answers(t.published.template ?? t.published, { code, name })])), phases: {},
      submission: { game_type_pref: ['双人', '多人', '都可以'][i % 3], gender_pref: '都可以', availability: availability(p.round.activity_start, p.round.activity_end, code), interest_tags: [['电影', '音乐'], ['桌游', '读书'], ['旅行', '游戏'], ['烹饪', '运动']][i % 4], social_style: ['慢热', '活跃', '善于倾听'][i % 3], message: '仅用于测试轮次的合成报名资料', custom_answers: {} } }
  })
  await save(flags.out, { version: 1, batch: BATCH, round_id: ROUND, real_member_ids: REAL, prepared_at: new Date().toISOString(), expected_old_members: p.old_members.map(m => ({ id: m.id, member_number: m.member_number, full_name: m.identity.full_name })), round: p.round, source_template_versions: p.templates.map(t => ({ kind: t.kind, published_version_id: t.published_version_id })), accounts })
  console.log(JSON.stringify({ prepared: 27, manifest: resolve(flags.out), synthetic: true, writes: 0 })); process.exit(0)
}
assert(['dry-run', 'provision', 'cleanup', 'configure', 'enrol', 'verify', 'credentials'].includes(command), 'Command: prepare | dry-run | provision | cleanup | configure | enrol | verify | credentials')
assert(flags.manifest, 'Missing --manifest PRIVATE_FILE'); const manifestPath = privatePath(flags.manifest), manifest = await privateLoad(manifestPath)
assert(manifest.batch === BATCH && manifest.round_id === ROUND && manifest.accounts.length === 27, 'Unexpected manifest')
if (command === 'credentials') {
  assert(flags.out, 'Missing --out PRIVATE_MD')
  await save(flags.out, ['# TST 测试账号说明', '', '登录地址：https://www.zhuxishe.jp/app', '', '这些账号仅用于测试轮次，邮箱是不可投递的保留域名；请用邮箱和密码登录，找回邮件不可达，需要超级管理员受控重置。账号和密码请私密保管。', '', '| 编号 | 合成姓名 | 登录邮箱 | 初始密码 |', '|---|---|---|---|', ...manifest.accounts.map(a => `| ${a.code} | ${a.name} | ${a.email} | ${a.password} |`), '', '已报名目标：2026秋季10月匹配（测试）。脚本不运行匹配或发布；管理员手动运行、核对33人名单后发布。', '', '允许的真实测试账号：ZXS_000、ZXS_001、ZXS_006、ZXS_016、ZXS_081、ZXS_250。其他真实用户不能报名此测试轮次，也不会收到这轮通知。', '', '测试账号不占用正式ZXS编号，不计入正式会员人数。测试评分、匹配历史与冷却和正式业务隔离。请勿将测试账号交给真实会员或用于真实活动。', ''].join('\n'))
  console.log(JSON.stringify({ credentials_file: resolve(flags.out), accounts: 27 })); process.exit(0)
}
assert(flags.config, 'Missing --config PRIVATE_CONFIG'); const config = await privateLoad(flags.config), url = new URL(config.apiUrl), local = ['127.0.0.1', 'localhost'].includes(url.hostname)
assert(local || url.hostname === 'wjjhprflldvclulistcx.supabase.co', 'Only isolated localhost or explicitly authorized production is allowed')
assert(url.protocol === (local ? 'http:' : 'https:'), 'Unexpected protocol'); assert(config.serviceKey && config.anonKey && config.actorAdminId, 'Config requires serviceKey, anonKey and actorAdminId')
if (['provision', 'cleanup', 'configure', 'enrol'].includes(command)) { assert(flags.apply === true, 'Mutation requires --apply'); if (!local) assert(flags['project-ref'] === 'wjjhprflldvclulistcx', 'Production mutation requires explicit --project-ref') }
const api = config.apiUrl.replace(/\/$/, '')
async function request(path, body, token = config.serviceKey, method = 'POST') {
  const response = await fetch(`${api}${path}`, { method, signal: AbortSignal.timeout(60_000), headers: { apikey: token === config.serviceKey ? config.serviceKey : config.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const raw = await response.text(); let data; try { data = JSON.parse(raw) } catch { data = { message: raw.slice(0, 200) } }
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${data.code ?? ''} ${data.message ?? data.msg ?? data.error_description ?? 'request failed'}`); return data
}
const rpc = (name, body, token) => request(`/rest/v1/rpc/${name}`, body, token)
const reason = 'Replace legacy imported test records with isolated TST login accounts'
const checkpoint = async () => save(manifestPath, manifest)
const login = async account => request('/auth/v1/token?grant_type=password', { email: account.email, password: account.password }, config.anonKey)
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
async function liveRound(token) {
  const rows = await request(`/rest/v1/match_rounds?select=*&id=eq.${ROUND}`, undefined, token, 'GET')
  assert(rows.length === 1 && rows[0].id === ROUND && !rows[0].deleted_at, 'Target round is unavailable')
  const current = rows[0]
  for (const key of ['round_name', 'purpose', 'activity_start', 'activity_end', 'content_config']) assert(JSON.stringify(canonical(current[key])) === JSON.stringify(canonical(manifest.round[key])), `Target round definition changed: ${key}`)
  for (const key of ['survey_start', 'survey_end']) assert(Date.parse(current[key]) === Date.parse(manifest.round[key]), `Target round collection window changed: ${key}`)
  assert(Number.isInteger(current.config_revision), 'Invalid live round configuration revision')
  return current
}
if (command === 'dry-run' || command === 'cleanup') {
  const result = await rpc('admin_cleanup_legacy_matching_test_pool', { p_actor_admin_id: config.actorAdminId, p_expected_members: manifest.expected_old_members, p_reason: reason, p_dry_run: command !== 'cleanup' })
  if (command === 'cleanup') { manifest.cleanup = result; await checkpoint() }; console.log(JSON.stringify(result))
} else if (command === 'provision') {
  const existing = []
  for (let page = 1; page <= 20; page++) { const data = await request(`/auth/v1/admin/users?page=${page}&per_page=1000`, undefined, config.serviceKey, 'GET'); existing.push(...data.users); if (data.users.length < 1000) break; assert(page < 20, 'Bounded Auth listing exceeded') }
  for (const a of manifest.accounts) {
    if (!a.user_id) {
      let user = existing.find(u => u.email?.toLowerCase() === a.email)
      if (user) assert(user.app_metadata?.test_pool_batch === BATCH && user.app_metadata?.test_pool_code === a.code, `Refuse unrelated Auth identity ${a.code}`)
      else user = await request('/auth/v1/admin/users', { email: a.email, password: a.password, email_confirm: true, app_metadata: { test_pool_batch: BATCH, test_pool_code: a.code }, user_metadata: { display_name: a.name } })
      a.user_id = user.id; a.phases.auth_created = new Date().toISOString(); await checkpoint()
    }
    if (!a.phases.member_created) { await rpc('admin_provision_test_account', { p_actor_admin_id: config.actorAdminId, p_member_id: a.member_id, p_user_id: a.user_id, p_code: a.code, p_name: a.name, p_batch: BATCH, p_reason: reason }); a.phases.member_created = new Date().toISOString(); await checkpoint() }
    const session = await login(a); assert(session.user.id === a.user_id && session.access_token, `Auth identity mismatch ${a.code}`)
    for (const kind of ['interview', 'supplementary', 'personality', 'quiz']) {
      if (a.phases[kind]) continue
      if (kind !== 'interview' && !a.phases.activated) { await rpc('admin_activate_test_account', { p_actor_admin_id: config.actorAdminId, p_member_id: a.member_id, p_reason: reason }); a.phases.activated = new Date().toISOString(); await checkpoint() }
      const runtime = await rpc('get_my_questionnaire', { p_kind: kind }, session.access_token)
      if (!runtime.completed) { const values = answers(runtime.template, a, runtime.answers); await rpc('save_my_questionnaire', { p_kind: kind, p_version_id: runtime.versionId, p_answers: values, p_step: null, p_complete: true, p_expected_revision: runtime.revision }, session.access_token); a.questionnaire_answers[kind] = values }
      a.phases[kind] = new Date().toISOString(); await checkpoint()
    }
    console.log(JSON.stringify({ code: a.code, provisioned: true, questionnaires: 4 }))
  }
} else if (command === 'configure') {
  assert(manifest.accounts.every(a => a.phases.quiz && a.user_id), 'Provision all accounts first')
  await liveRound(config.serviceKey)
  const result = await rpc('admin_configure_test_round', { p_actor_admin_id: config.actorAdminId, p_round_id: ROUND, p_member_ids: [...REAL, ...manifest.accounts.map(a => a.member_id)], p_reason: reason }); manifest.round = await liveRound(config.serviceKey); manifest.configured = result; await checkpoint(); console.log(JSON.stringify(result))
} else if (command === 'enrol' || command === 'verify') {
  const results = []
  for (const a of manifest.accounts) {
    const session = await login(a); assert(session.user.id === a.user_id, `Auth mismatch ${a.code}`)
    const ready = await rpc('get_my_matching_readiness', {}, session.access_token); assert(ready.supplementary && ready.personality && ready.quiz, `Incomplete ${a.code}`)
    if (command === 'enrol' && !a.phases.enrolled) {
      const currentRound = await liveRound(session.access_token)
      assert(currentRound.status === 'open', 'Target round is not collecting')
      const prior = await request(`/rest/v1/match_round_submissions?select=id,updated_at&round_id=eq.${ROUND}&member_id=eq.${a.member_id}`, undefined, session.access_token, 'GET')
      if (!prior.length) await rpc('save_my_matching_submission', { p_round_id: ROUND, p_submission_id: null, p_expected_updated_at: null, p_config_revision: currentRound.config_revision, p_answers: a.submission }, session.access_token)
      a.phases.enrolled = new Date().toISOString(); await checkpoint()
    }
    const rows = await request(`/rest/v1/match_round_submissions?select=id,cancelled_at,availability,member_id&round_id=eq.${ROUND}&member_id=eq.${a.member_id}`, undefined, session.access_token, 'GET')
    assert(rows.length === 1 && rows[0].cancelled_at === null && Object.keys(rows[0].availability).length >= 5, `Invalid active registration ${a.code}`)
    results.push({ code: a.code, login: true, readiness: true, active_submission: rows[0].id, dates: Object.keys(rows[0].availability).length })
  }
  await save(`${dirname(manifestPath)}/verification.json`, { checked_at: new Date().toISOString(), round_id: ROUND, results }); console.log(JSON.stringify({ verified: results.length, results }))
}
