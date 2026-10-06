// Real browser checks of application components with synthetic fixtures only.
// No authenticated session, live Server Action, or production data is used.
// Run: node scripts/activity-reviews/verify-score-flow.mjs
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium, webkit, expect } from '@playwright/test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const port = Number(process.env.PEER_REVIEW_VERIFY_PORT || 3201)
const output = process.env.PEER_REVIEW_VERIFY_OUTPUT || '/tmp/zhuxi-review-score-verification'
const testFilter = process.env.PEER_REVIEW_VERIFY_ONLY ? new RegExp(process.env.PEER_REVIEW_VERIFY_ONLY) : null
const browserName = process.env.PEER_REVIEW_VERIFY_BROWSER || 'chromium'
assert.ok(['chromium', 'webkit'].includes(browserName), 'Supported verification browsers: chromium, webkit')
mkdirSync(output, { recursive: true })
const fixture = spawn(process.execPath, ['scripts/activity-reviews/visual-review.mjs', 'after', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let startupLog = ''
const ready = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(Error(`Fixture startup timed out: ${startupLog}`)), 30000)
  fixture.stdout.on('data', data => { startupLog += data; if (startupLog.includes('UI fixture after:')) { clearTimeout(timeout); resolve() } })
  fixture.stderr.on('data', data => { startupLog += data })
  fixture.once('exit', code => { clearTimeout(timeout); reject(Error(`Fixture exited (${code}): ${startupLog}`)) })
})
const firstWarning = '1.0分默认对方存在恶意行为，不适合社团健康发展行为，并自动进行举报。请问仍要提交1分的评价吗？'
const finalWarning = '提交1.0分评价或举报时候，将自动接入人工审查。为确保社团良性发展，您和对方或许只能保留一位成员继续在社团活动。请问仍要进行举报吗？'
const detail = '演示记录：活动中多次未经允许传播参与者的私人信息，请工作人员核实。'
const results = []
let browser
const editor = page => page.locator('#activity-review-editor')
const slider = page => editor(page).getByRole('slider')
const button = (page, name) => editor(page).getByRole('button', { name, exact: true })
const submissions = page => page.evaluate(() => window.__submissions || [])
async function selectScore(page, score) {
  await slider(page).focus()
  await slider(page).press('Home')
  for (let value = 1; value < score; value += .5) await slider(page).press('ArrowRight')
  await expect(slider(page)).toHaveValue(String(score))
}
async function firstConfirmation(page, saveLabel = '保存评价') {
  await button(page, saveLabel).click()
  const dialog = page.getByRole('dialog', { name: '确认 1.0 分评价', exact: true })
  await expect(dialog).toContainText(firstWarning)
  assert.equal((await submissions(page)).length, 0)
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(editor(page).getByLabel('具体举报信息', { exact: true })).toBeVisible()
}
async function submitConfirmation(page) {
  const dialog = page.getByRole('dialog', { name: '确认提交人工审查', exact: true })
  await expect(dialog).toContainText(finalWarning)
  return dialog
}
async function screenshotAfterAnimations(locator, path) {
  await locator.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
  })
  await expect(locator).toHaveCSS('opacity', '1')
  await locator.screenshot({ path })
}
async function run(name, test, query = '', mobile = false) {
  if (testFilter && !testFilter.test(name)) return
  const context = await browser.newContext(mobile ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  try {
    const params = new URLSearchParams(query)
    if (!params.has('screen')) params.set('screen', 'editor')
    await page.goto(`http://127.0.0.1:${port}/?${params}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await test(page, context)
    assert.deepEqual(errors, [], 'No browser runtime errors')
    results.push({ name, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    await page.screenshot({ path: `${output}/failure-${results.length + 1}.png`, fullPage: true })
    throw new Error(`${name}: ${error.message}`, { cause: error })
  } finally { await context.close() }
}

try {
  await ready
  browser = await (browserName === 'webkit' ? webkit : chromium).launch({ headless: true })
  await run('Unselected score, all nine half-point values, keyboard bounds and normal save', async page => {
    await expect(slider(page)).toHaveAttribute('min', '1')
    await expect(slider(page)).toHaveAttribute('max', '5')
    await expect(slider(page)).toHaveAttribute('step', '0.5')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', '请选择评分')
    await expect(button(page, '保存评价')).toBeDisabled()
    await slider(page).press('Enter')
    await expect(slider(page)).toHaveAttribute('aria-valuetext', '3.0 分')
    await slider(page).press('Home')
    for (let value = 1; value <= 5; value += .5) {
      await expect(slider(page)).toHaveValue(String(value))
      await expect(slider(page)).toHaveAttribute('aria-valuetext', `${value.toFixed(1)} 分`)
      await slider(page).press('ArrowRight')
    }
    await expect(slider(page)).toHaveValue('5')
    await slider(page).press('ArrowLeft')
    await editor(page).locator('#activity-review-comment').fill('  谢谢这次的交流。  ')
    await button(page, '保存评价').click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('评价已保存')
    const [input] = await submissions(page)
    assert.deepEqual(input.review, { score: 4.5, comment: '谢谢这次的交流。', expectedVersion: 0 })
    assert.equal(input.report, undefined)
    await expect(slider(page)).toHaveValue('4.5')
    await slider(page).press('ArrowLeft')
    await button(page, '更新评价').click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('评价已更新')
    assert.equal((await submissions(page))[1].review.expectedVersion, 1)
  })

  await run('Mouse drag updates continuously with exact half points', async page => {
    await selectScore(page, 1)
    await slider(page).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const box = await slider(page).boundingBox()
    await slider(page).evaluate(element => { window.__dragValues = []; element.addEventListener('input', () => window.__dragValues.push(Number(element.value))) })
    await page.mouse.move(box.x + 14, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 14, box.y + box.height / 2, { steps: 40 })
    await page.mouse.up()
    await expect(slider(page)).toHaveValue('5')
    const values = await page.evaluate(() => window.__dragValues)
    assert.ok(values.length >= 8, `Expected continuous half-point changes, received ${values}`)
    assert.ok(values.every(value => value >= 1 && value <= 5 && Number.isInteger(value * 2)))
    await slider(page).screenshot({ path: `${output}/desktop-slider.png` })
  })

  await run('First cancel sends nothing; accepted first step only opens and focuses report', async page => {
    await selectScore(page, 1)
    await button(page, '保存评价').click()
    const dialog = page.getByRole('dialog', { name: '确认 1.0 分评价', exact: true })
    await expect(dialog).toContainText(firstWarning)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(editor(page).locator('#activity-report-detail')).toHaveCount(0)
    await expect(slider(page)).toHaveValue('1')
    assert.equal((await submissions(page)).length, 0)
    await firstConfirmation(page)
    await expect(editor(page).locator('#activity-report-detail')).toBeFocused()
    assert.equal((await submissions(page)).length, 0)
    await expect(button(page, '保存评价并提交举报')).toBeDisabled()
  })

  await run('Combined second cancel preserves draft; confirm resists duplicate clicks and matches API fields', async page => {
    await selectScore(page, 1)
    await editor(page).locator('#activity-review-comment').fill('  本次发生了需要工作人员核实的问题。  ')
    await firstConfirmation(page)
    await editor(page).locator('#activity-report-category').selectOption('privacy')
    await editor(page).locator('#activity-report-detail').fill(`  ${detail}  `)
    await button(page, '保存评价并提交举报').click()
    let dialog = await submitConfirmation(page)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    assert.equal((await submissions(page)).length, 0)
    await expect(editor(page).locator('#activity-report-detail')).toHaveValue(`  ${detail}  `)
    await button(page, '保存评价并提交举报').click()
    dialog = await submitConfirmation(page)
    await dialog.getByRole('button', { name: '确定', exact: true }).evaluate(element => { element.click(); element.click() })
    await expect(slider(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: /陈一.*橘子汽水/ })).toBeDisabled()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('举报已提交')
    const saved = await submissions(page)
    assert.equal(saved.length, 1)
    assert.deepEqual(saved[0].review, { score: 1, comment: '本次发生了需要工作人员核实的问题。', expectedVersion: 0 })
    assert.deepEqual(saved[0].report, { category: 'privacy', detail, expectedVersion: 0 })
    assert.equal(saved[0].operation, 'save')
    assert.match(saved[0].requestId, /^[0-9a-f-]{36}$/)
    await expect(slider(page)).toHaveValue('1')
    await expect(button(page, '更新评价')).toBeEnabled()
  }, '&actionDelay=700')

  await run('One-point report-only requires final confirmation and never includes review fields', async page => {
    await selectScore(page, 1)
    await firstConfirmation(page)
    await editor(page).locator('#activity-report-detail').fill(detail)
    await button(page, '仅提交举报').click()
    const dialog = await submitConfirmation(page)
    assert.equal((await submissions(page)).length, 0)
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('举报已提交')
    const [saved] = await submissions(page)
    assert.equal(saved.review, undefined)
    assert.equal(saved.report.detail, detail)
    await expect(button(page, '保存评价')).toBeEnabled()
  })

  await run('Network failure preserves fields and retry reuses request ID', async page => {
    await selectScore(page, 1)
    await firstConfirmation(page)
    await editor(page).locator('#activity-report-detail').fill(detail)
    await button(page, '保存评价并提交举报').click()
    await (await submitConfirmation(page)).getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('提交失败，请稍后重试。')
    await expect(slider(page)).toBeEnabled()
    await expect(editor(page).locator('#activity-report-detail')).toHaveValue(detail)
    await button(page, '保存评价并提交举报').click()
    await (await submitConfirmation(page)).getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('举报已提交')
    const saved = await submissions(page)
    assert.equal(saved.length, 2)
    assert.equal(saved[0].requestId, saved[1].requestId)
  }, '&failFirst=1')

  await run('History editing reaches report flow without losing the selected target', async page => {
    await page.getByTestId('activity-review-history').locator('summary').click()
    await page.getByRole('button', { name: '修改评价', exact: true }).click()
    await expect(slider(page)).toHaveValue('4.5')
    await selectScore(page, 1)
    await firstConfirmation(page, '更新评价')
    await editor(page).locator('#activity-report-detail').fill(detail)
    await button(page, '保存评价并提交举报').click()
    await (await submitConfirmation(page)).getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const [saved] = await submissions(page)
    assert.equal(saved.targetMemberId, '10000000-0000-4000-8000-000000000003')
    assert.equal(saved.review.expectedVersion, 1)
    await expect(page.getByTestId('activity-review-history').getByText('1.0 分', { exact: true })).toBeVisible()
  }, '&screen=history')

  await run('Japanese dialogs and half-point labels match the same submit flow', async page => {
    await selectScore(page, 1)
    await expect(slider(page)).toHaveAttribute('aria-valuetext', '1.0 点')
    await slider(page).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await slider(page).tap({ position: { x: 14, y: 24 } })
    await slider(page).evaluate(element => element.blur())
    await screenshotAfterAnimations(editor(page), `${output}/mobile-ja-editor.png`)
    await button(page, '評価を保存').click()
    const first = page.getByRole('dialog', { name: '1.0 点の評価を確認', exact: true })
    await expect(first).toContainText('悪意ある行為')
    await screenshotAfterAnimations(first, `${output}/mobile-ja-first-confirmation.png`)
    await first.getByRole('button', { name: '確認', exact: true }).click()
    await editor(page).locator('#activity-report-detail').fill(detail)
    await button(page, '評価を保存して通報を送信').click()
    const final = page.getByRole('dialog', { name: '管理者による確認への送信', exact: true })
    await expect(final).toContainText('どちらか一人だけ')
    await screenshotAfterAnimations(final, `${output}/mobile-ja-final-confirmation.png`)
    await final.getByRole('button', { name: '確認', exact: true }).click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('通報を送信しました')
    assert.equal((await submissions(page))[0].review.score, 1)
  }, '&locale=ja', true)

  await run('History report-only retains unsaved one-point draft for a later atomic save', async page => {
    await page.getByTestId('activity-review-history').locator('summary').click()
    await page.getByRole('button', { name: '修改评价', exact: true }).click()
    await selectScore(page, 1)
    await firstConfirmation(page, '更新评价')
    await editor(page).locator('#activity-report-detail').fill(detail)
    await button(page, '仅提交举报').click()
    await (await submitConfirmation(page)).getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('举报已提交')
    await expect(slider(page)).toHaveValue('1')
    assert.equal((await submissions(page))[0].review, undefined)
    await expect(page.getByRole('dialog', { name: '修改评价', exact: true })).toBeVisible()
    await editor(page).locator('#activity-report-supplement').fill('补充记录：本次评价与已提交的举报描述为同一事件，请核实。')
    await button(page, '保存评价并提交补充').click()
    await (await submitConfirmation(page)).getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const saved = await submissions(page)
    assert.equal(saved[1].review.score, 1)
    assert.equal(saved[1].review.expectedVersion, 1)
    assert.equal(saved[1].report.expectedVersion, 1)
    assert.equal(saved[1].operation, 'save')
  }, '&screen=history')

  for (const status of ['pending', 'reviewing', 'resolved', 'dismissed']) {
    await run(`Existing ${status} report requires atomic score plus supplement with both versions`, async page => {
      await page.getByRole('button', { name: /陈一.*橘子汽水/ }).click()
      await selectScore(page, 1)
      await button(page, '更新评价').click()
      const first = page.getByRole('dialog', { name: '确认 1.0 分评价', exact: true })
      await first.getByRole('button', { name: '确定', exact: true }).click()
      await expect(first).toBeHidden()
      await expect(button(page, '保存评价并提交补充')).toBeDisabled()
      assert.equal((await submissions(page)).length, 0)
      await editor(page).locator('#activity-report-supplement').fill(detail)
      await button(page, '保存评价并提交补充').click()
      await (await submitConfirmation(page)).getByRole('button', { name: '确定', exact: true }).click()
      await expect(editor(page).locator('p[role="status"]')).toHaveText('举报已提交')
      const [saved] = await submissions(page)
      assert.equal(saved.operation, 'save')
      assert.equal(saved.review.score, 1)
      assert.equal(saved.review.expectedVersion, 1)
      assert.equal(saved.report.expectedVersion, 1)
      assert.equal(saved.report.detail, detail)
    }, `&sameTargetReport=1&reportStatus=${status}`)
  }

  await run('Changing from one point to 1.5 keeps normal combined behavior and sends the new number', async page => {
    await selectScore(page, 1)
    await firstConfirmation(page)
    await editor(page).locator('#activity-report-detail').fill(detail)
    await selectScore(page, 1.5)
    await button(page, '保存评价并提交举报').click()
    await expect(editor(page).locator('p[role="status"]')).toHaveText('举报已提交')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    assert.equal((await submissions(page))[0].review.score, 1.5)
  })

  // Chromium exposes touch move injection through CDP. The separate mobile
  // Japanese test covers native tapping and modal layout in both engines.
  if (browserName === 'chromium') await run('Mobile touch drag, first and final modal fit, and no horizontal overflow', async (page, context) => {
    await slider(page).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await slider(page).tap()
    await expect(slider(page)).toHaveAttribute('aria-valuetext', '3.0 分')
    await selectScore(page, 1)
    await slider(page).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const box = await slider(page).boundingBox()
    const cdp = await context.newCDPSession(page)
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 14, y }] })
    for (let step = 1; step <= 20; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 14 + (box.width - 28) * step / 20, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(slider(page)).toHaveValue('5')
    await selectScore(page, 1)
    await slider(page).tap({ position: { x: 14, y: 24 } })
    await slider(page).evaluate(element => element.blur())
    await screenshotAfterAnimations(editor(page), `${output}/mobile-editor.png`)
    await button(page, '保存评价').click()
    const first = page.getByRole('dialog', { name: '确认 1.0 分评价', exact: true })
    await expect(first).toBeVisible()
    const firstBox = await first.boundingBox()
    assert.ok(firstBox.x >= 0 && firstBox.x + firstBox.width <= 376)
    await screenshotAfterAnimations(first, `${output}/mobile-first-confirmation.png`)
    await first.getByRole('button', { name: '确定', exact: true }).click()
    await editor(page).locator('#activity-report-detail').fill(detail)
    await button(page, '保存评价并提交举报').click()
    const final = await submitConfirmation(page)
    await screenshotAfterAnimations(final, `${output}/mobile-final-confirmation.png`)
    await final.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal((await submissions(page)).length, 0)
    await page.setViewportSize({ width: 320, height: 740 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }, '', true)

  console.log(JSON.stringify({ browser: browserName, version: await browser.version(), checks: results, evidenceDirectory: output }, null, 2))
} finally {
  await browser?.close()
  fixture.kill('SIGTERM')
}
