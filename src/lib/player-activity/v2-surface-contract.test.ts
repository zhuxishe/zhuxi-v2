import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

describe("Player Activity V2 surface wiring", () => {
  it("renders activity hub sections only when their module is enabled", () => {
    const page = source("src/app/app/scripts/page.tsx")
    expect(page).toContain("data.settings.largeActivitiesEnabled")
    expect(page).toContain("data.settings.socialScriptsEnabled")
    expect(page).toContain("data.settings.scriptLibraryEnabled")
  })

  it("enforces module switches on every child route", () => {
    for (const path of [
      "src/app/app/scripts/large/page.tsx",
      "src/app/app/scripts/social/page.tsx",
      "src/app/app/scripts/library/page.tsx",
    ]) {
      expect(source(path)).toContain("notFound()")
    }
    const detail = source("src/app/app/scripts/[id]/page.tsx")
    expect(detail).toContain("settings.scriptLibraryEnabled")
    expect(detail).toContain("settings.socialScriptsEnabled && script.is_social_script")
    expect(detail).toContain("if (!detailEnabled) notFound()")
  })

  it("uses scoped metadata and protected-content readers for details", () => {
    const playerDetail = source("src/app/app/scripts/[id]/page.tsx")
    const publicDetail = source("src/app/scripts/[id]/page.tsx")
    expect(playerDetail).toContain("fetchPlayerScriptMetadata")
    expect(playerDetail).toContain("fetchAuthorizedScriptContent")
    expect(playerDetail).not.toContain("fetchScript(")
    expect(publicDetail).toContain("fetchPublicScript")
    expect(publicDetail).not.toContain("script.content_html")
  })

  it("does not resurrect the fifteen static reviews at runtime", () => {
    const reviews = source("src/components/landing/PastReviewsSection.tsx")
    expect(reviews).toContain("const reviews = dbState.reviews")
    expect(reviews).not.toContain("getLandingEventReviews")
    expect(reviews).not.toContain("mergeLandingEventReviews")
  })

  it("bypasses Next image host allowlists for configured HTTPS covers and signed pages", () => {
    for (const path of [
      "src/components/player/activity/LargeActivityCard.tsx",
      "src/components/player/activity/SocialScriptCards.tsx",
      "src/components/landing/PublicScriptLibrary.tsx",
      "src/components/landing/PastReviewCard.tsx",
      "src/app/app/scripts/[id]/page.tsx",
      "src/app/app/scripts/large/[id]/page.tsx",
      "src/app/scripts/[id]/page.tsx",
    ]) {
      expect(source(path)).toContain("unoptimized=")
    }
    expect(source("src/components/player/FlipBookViewer.tsx")).toContain("unoptimized")
  })
})
