// Offline proof that board capture, saved review, Excel and final publication
// describe the same assignments/current time intersection. Never uses a network DB.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(join(root, 'package.json'))
process.env.MATCHING_BOARD_MEMBER_LOCK_SUITE = '1'
const { boardAuditContext: ctx } = await import('./matching-board-pglite.mjs')
const { db, scalar, role, admin, server, adminRole, session, ids, get, params, persist, answers, submit,
  preparePublicationPreflightInput, inspectPublicationPreflight, temporary } = ctx
const { build } = await import(process.env.ESBUILD_MODULE || 'esbuild')
const excelPath = require.resolve('exceljs')
const bundle = await build({
  stdin: { contents: `export {buildSavedMatchingReview,matchingReviewPublicationSignature,savedMatchingReviewWorkbookData} from './src/lib/matching/session-review'; export {createSessionExportWorkbook} from './src/lib/matching/session-export-workbook'`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': join(root, 'src'), exceljs: excelPath }, external: [excelPath],
})
const reviewModule = join(temporary, 'review.cjs')
writeFileSync(reviewModule, bundle.outputFiles[0].contents)
const { default: reviewApi } = await import(pathToFileURL(reviewModule).href)
const { buildSavedMatchingReview, matchingReviewPublicationSignature, savedMatchingReviewWorkbookData, createSessionExportWorkbook } = reviewApi
let checks = 0
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++ }
const state = () => scalar(`SELECT jsonb_build_object('results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.match_results r WHERE session_id=$1),
 'source',(SELECT source_digest FROM matching_run.snapshots WHERE session_id=$1),
 'publications',(SELECT count(*) FROM matching_publication.publications WHERE session_id=$1),
 'notices',(SELECT count(*) FROM public.community_notifications WHERE match_session_id=$1))`, [session])
try {
  await role(); const beforeRead = await state()
  let board = await get(), review = buildSavedMatchingReview(session, board, true)
  check(review.summary, { total: 10, duoGroups: 2, multiGroups: 1, matched: 8, waitingDuo: 0, waitingMulti: 0, unmatched: 2 }, 'the real board capture projects every cohort member once')
  check(review.issues, [], 'the real saved valid board has no review warning')
  await server()
  let preparation = await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)', [session, admin])
  check(matchingReviewPublicationSignature(session, preparation.current_rows, preparation.capture), review.publicationSignature, 'board source_v3 and publication hard source have the same reviewed assignments and common time')
  check(inspectPublicationPreflight(preparePublicationPreflightInput(preparation.capture), preparation.current_rows).passed, true, 'the original publication preflight accepts the reviewed rows')
  const exportData = savedMatchingReviewWorkbookData(board, review)
  const workbook = createSessionExportWorkbook({ ...exportData, diagnostics: [], snapshot: null, review })
  const excel = require('exceljs')
  const decoded = new excel.Workbook()
  await decoded.xlsx.load(await workbook.xlsx.writeBuffer())
  const values = sheet => {
    const headers = sheet.getRow(1).values.slice(1)
    return Array.from({ length: sheet.rowCount - 1 }, (_, index) => Object.fromEntries(headers.map((header, col) => [header, sheet.getRow(index + 2).getCell(col + 1).value])))
  }
  const publicationRows = values(decoded.getWorksheet('结果发布'))
  const decodeSlots = text => String(text).split('\n').flatMap(line => {
    const date = line.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    return date ? [...line.matchAll(/上午|下午|晚上/g)].map(match => `${date}_${match[0]}`) : []
  }).sort()
  check(publicationRows.length, review.groups.length, 'actual XLSX has one summary row for each reviewed saved result')
  for (const [index, group] of review.groups.entries()) {
    check(publicationRows[index]['组别'], group.label, 'Excel group number equals the review')
    check(publicationRows[index]['玩家姓名'], group.members.map(member => member.name).join('\n'), 'Excel group members equal the review')
    check(publicationRows[index]['人数'], group.members.length, 'Excel group size equals the review')
    check(decodeSlots(publicationRows[index]['推荐时间']), [group.recommendedSlot], 'Excel recommendation equals the saved reviewed slot')
    check(decodeSlots(publicationRows[index]['共同可用时间段']), [...group.commonSlots].sort(), 'Excel all-common-time column equals the current review intersection')
    check(decodeSlots(publicationRows[index]['其他共同时间']), group.commonSlots.filter(slot => slot !== group.recommendedSlot).sort(), 'Excel other-common-time column excludes exactly the recommended period')
  }
  await role(); check(await state(), beforeRead, 'read review and XLSX generation never write results, inputs, publications or notifications')
  const originalSignature = review.publicationSignature, originalRevision = review.revisionToken
  const duo = board.results.find(row => row.member_b_id)
  for (const memberId of [duo.member_a_id, duo.member_b_id]) {
    const payload = answers('双人'); payload.availability['2026-10-27'].push('晚上')
    await submit(ids.indexOf(memberId), payload)
  }
  board = await get(); review = buildSavedMatchingReview(session, board, true)
  check(review.publicationSignature === originalSignature, false, 'current shared-time edits invalidate the reviewed publication signature')
  check(review.revisionToken === originalRevision, false, 'current answers invalidate the full review revision')
  check(review.groups.find(group => group.resultId === duo.id).commonSlots, ['2026-10-27_下午', '2026-10-27_晚上'], 'review uses updated shared answers rather than the initial run snapshot')
  await role(); check((await state()).source, beforeRead.source, 'review never rewrites the original sealed run input')
  await server(); preparation = await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)', [session, admin])
  check(matchingReviewPublicationSignature(session, preparation.current_rows, preparation.capture), review.publicationSignature, 'fresh publication and fresh review still agree after a legitimate answer update')
  const beforePlacement = review
  await persist(params(board, { layout: { waitingDuoIds: [ids[8]], brokenPairs: [] } }))
  board = await get(); review = buildSavedMatchingReview(session, board, true)
  check(review.publicationSignature, beforePlacement.publicationSignature, 'a waiting-only move does not invent a change to the saved matched groups')
  check(review.revisionToken === beforePlacement.revisionToken, false, 'the full revision detects a waiting-only move that the group signature intentionally ignores')
  check([review.waitingDuo.map(member => member.id), review.unmatched.map(member => member.id)], [[ids[8]], [ids[9]]], 'waiting-duo and unmatched lists remain distinct')
  await server(); preparation = await scalar('SELECT public.admin_prepare_match_publication($1,$2,0)', [session, admin])
  const proof = await scalar('SELECT public.admin_authorize_match_publication($1,$2,0,$3)', [session, admin, preparation.revision_token])
  await adminRole()
  await scalar("SELECT public.admin_publish_checked_match_session($1,0,'隔离核对表与发布一致性验证',$2)", [session, proof.preflight_id])
  const published = await get(), publishedReview = buildSavedMatchingReview(session, published, true)
  check(published.session_status, 'confirmed', 'the real checked publication succeeds only in the local fixture')
  check(publishedReview.publicationSignature, review.publicationSignature, 'publication preserves every reviewed member, recommendation and common-time intersection')
  check(publishedReview.groups.map(group => [group.resultId, group.members.map(member => member.id), group.recommendedSlot]), review.groups.map(group => [group.resultId, group.members.map(member => member.id), group.recommendedSlot]), 'published player-facing result identities exactly match the reviewed saved groups')
  console.log(`Matching saved review / Excel / publication SQL audit: ${checks} checks passed; isolated PGlite only.`)
} finally {
  await db.close()
  rmSync(temporary, { recursive: true, force: true })
}
