// Local-only UI evidence. Use real components with explicit synthetic actions.
// Start visual-review.mjs before 3216 and after 3217 before running both modes.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const mode = process.argv[2] || 'after'
assert.ok(['before', 'after'].includes(mode))
const port = mode === 'before' ? 3216 : 3217
const output = process.env.UNIFIED_REVIEW_UI_OUTPUT || 'output/score-unification-20261117'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const evidence = []
try {
  for (const [label, width, height] of [['mobile', 390, 844], ['desktop', 1280, 1000]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/?screen=entry`)
    await page.locator(mode === 'before' ? 'div.p-6' : '#activity-review-editor').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${output}/${mode}-new-match-${label}.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow')

    await page.goto(`http://127.0.0.1:${port}/?screen=legacy`)
    await page.getByRole('heading', { name: '活动后评价', exact: true }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    const legacyPath = `${output}/${mode}-legacy-${label}.png`
    await page.locator('div.p-6').screenshot({ path: legacyPath })
    if (mode === 'after') assert.deepEqual(readFileSync(legacyPath), readFileSync(`${output}/before-legacy-${label}.png`), 'legacy UI pixels unchanged')

    await page.goto(`http://127.0.0.1:${port}/?screen=peer-legacy`)
    await page.locator('#activity-review-editor').waitFor()
    await page.evaluate(() => document.fonts.ready)
    const peerLegacyPath = `${output}/${mode}-peer-legacy-${label}.png`
    await page.locator('div.max-w-2xl.space-y-5').screenshot({ path: peerLegacyPath })
    if (mode === 'after') assert.deepEqual(readFileSync(peerLegacyPath), readFileSync(`${output}/before-peer-legacy-${label}.png`), 'existing single-review UI pixels unchanged')

    await page.goto(`http://127.0.0.1:${port}/?screen=edit-one`)
    const editor = page.locator('#activity-review-editor')
    await editor.waitFor()
    await editor.locator('#activity-review-comment').fill('补充说明：请工作人员结合原举报内容核实。')
    await editor.getByRole('button', { name: '更新评价', exact: true }).click()
    if (mode === 'before') {
      const dialog = page.getByRole('dialog', { name: '确认 1.0 分评价', exact: true })
      await dialog.waitFor()
      assert.match(await dialog.innerText(), /默认对方存在恶意行为/)
      assert.equal(await page.evaluate(() => (window.__submissions || []).length), 0)
      await page.screenshot({ path: `${output}/${mode}-edit-one-${label}.png`, fullPage: true })
    } else {
      await editor.getByText('评价已更新', { exact: true }).waitFor()
      const submissions = await page.evaluate(() => window.__submissions || [])
      assert.equal(submissions.length, 1)
      assert.equal(submissions[0].review.score, 1)
      assert.equal(submissions[0].report, undefined)
      await page.screenshot({ path: `${output}/${mode}-edit-one-${label}.png`, fullPage: true })
    }
    assert.deepEqual(errors, [], 'no browser errors')
    evidence.push({ viewport: label, noHorizontalOverflow: true, legacyUnchanged: mode === 'after', onePointCommentEdit: mode === 'before' ? 'legacy confirmation retained' : 'associated report reused', errors })
    await page.close()
  }
  writeFileSync(`${output}/${mode}-verification.json`, JSON.stringify({ mode, fixture: 'synthetic, no live API', evidence }, null, 2))
  console.log(JSON.stringify({ mode, evidence }))
} finally {
  await browser.close()
}
