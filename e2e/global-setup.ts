import { test as setup } from "@playwright/test"

// Global setup — runs once before all tests.
// Can be extended to save auth state via storageState.
setup("verify server is running", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("domcontentloaded")
})
