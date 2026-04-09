import { test, expect } from "@playwright/test"

/** 跳过 IntroOverlay 动画 */
async function skipIntro(page: import("@playwright/test").Page) {
  try {
    const skipBtn = page.getByText(/跳过|スキップ/)
    await skipBtn.waitFor({ state: "visible", timeout: 5000 })
    await skipBtn.click()
    // 等待 overlay 消失
    await page.locator(".fixed.inset-0.z-50").waitFor({ state: "hidden", timeout: 3000 }).catch(() => {})
  } catch {
    // overlay 可能已经完成或被 reduced-motion 跳过
  }
  // 等页面内容稳定
  await page.waitForTimeout(500)
}

test.describe("着陆页", () => {
  test("首页加载成功", async ({ page }) => {
    await page.goto("/")
    await skipIntro(page)
    await expect(page).toHaveTitle(/竹溪社/)
  })

  test("IntroOverlay 可跳过", async ({ page }) => {
    await page.goto("/")
    const skipBtn = page.getByText(/跳过|スキップ/)
    if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await skipBtn.click()
      // overlay div 应该消失
      await expect(page.locator(".fixed.inset-0.z-50")).not.toBeVisible({ timeout: 3000 })
    }
  })

  test("导航栏可见", async ({ page }) => {
    await page.goto("/")
    await skipIntro(page)
    await expect(page.locator("nav")).toBeVisible({ timeout: 5000 })
  })

  test("各 Section 存在", async ({ page }) => {
    await page.goto("/")
    await skipIntro(page)
    await expect(page.locator("#mission")).toBeAttached({ timeout: 5000 })
    await expect(page.locator("#faq")).toBeAttached({ timeout: 5000 })
    await expect(page.locator("#contact")).toBeAttached({ timeout: 5000 })
  })

  test("Contact 表单提交", async ({ page }) => {
    await page.goto("/#contact")
    await skipIntro(page)
    // 查找输入框（更宽松的匹配）
    const nameInput = page.locator("input[type=text]").first()
    const emailInput = page.locator("input[type=email]")
    const messageInput = page.locator("textarea")
    await nameInput.fill("测试用户")
    await emailInput.fill("test@example.com")
    await messageInput.fill("E2E 测试消息")
    await page.locator("#contact button[type=submit], #contact button").last().click()
    // 等待成功反馈
    await page.waitForTimeout(2000)
  })

  test("移动端响应式", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/")
    await skipIntro(page)
    await expect(page.locator("nav")).toBeVisible({ timeout: 5000 })
  })
})
