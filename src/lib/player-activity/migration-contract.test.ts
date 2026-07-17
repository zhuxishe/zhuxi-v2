import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { getLandingEventReviews } from "@/lib/landing-activity-photos"
import { sortLandingEventReviewsByNewestFirst } from "@/lib/landing-event-reviews"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260717133954_player_activity_v1.sql"),
  "utf8",
)
const websiteCompatibilityMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260717133955_keep_legacy_website_activity_catalogue.sql"),
  "utf8",
)

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

describe("Player Activity V1 migration", () => {
  it("migrates every established large event with bilingual public content", () => {
    const zhReviews = sortLandingEventReviewsByNewestFirst(getLandingEventReviews("zh", "large"))
    const jaById = new Map(getLandingEventReviews("ja", "large").map((review) => [review.id, review]))

    expect(zhReviews).toHaveLength(15)
    let previousIndex = -1
    for (const review of zhReviews) {
      const jaReview = jaById.get(review.id)
      expect(jaReview).toBeDefined()
      expect(migration).toContain(sqlLiteral(review.id))
      expect(migration).toContain(sqlLiteral(review.title))
      expect(migration).toContain(sqlLiteral(review.summary))
      expect(migration).toContain(sqlLiteral(jaReview!.title))
      expect(migration).toContain(sqlLiteral(jaReview!.summary))
      expect(migration).toContain(sqlLiteral(review.cover_url))
      expect(migration).toContain(`${sqlLiteral(JSON.stringify(review.gallery_urls))}::jsonb`)
      expect(migration).toContain(`DATE ${sqlLiteral(review.event_date!)}`)

      const sourceIndex = migration.indexOf(sqlLiteral(review.id))
      expect(sourceIndex).toBeGreaterThan(previousIndex)
      previousIndex = sourceIndex
    }
  })

  it("keeps social scripts opt-in and enforces placement as a subset", () => {
    expect(migration).toContain("is_social_script boolean NOT NULL DEFAULT false")
    expect(migration).toContain("CHECK (is_social_script OR NOT show_on_player_activity)")
    expect(migration).toContain("CHECK (is_social_script OR NOT pin_in_social_library)")
    expect(migration).toContain("AND script.is_featured = true")
    expect(migration).toContain("LIMIT 5")
  })

  it("uses the same approved-member boundary as Player authentication", () => {
    expect(migration).toContain("member.status = 'approved'")
    expect(migration).not.toContain("member.membership_type = 'player'")
  })

  it("keeps Player publication independent from the legacy public website", () => {
    expect(migration).not.toContain("sync_past_event_review_publication")
    expect(migration).toContain("is_published,")
    expect(migration).toContain("status,")
    expect(websiteCompatibilityMigration).toContain("SET is_published = false")
    for (const review of getLandingEventReviews("zh", "large")) {
      expect(websiteCompatibilityMigration).toContain(sqlLiteral(review.id))
    }
  })

  it("adds the singleton home-limit setting with explicit grants and RLS", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.player_activity_settings")
    expect(migration).toContain("CHECK (id = 1)")
    expect(migration).toContain("social_home_limit smallint NOT NULL DEFAULT 5")
    expect(migration).toContain("ALTER TABLE public.player_activity_settings ENABLE ROW LEVEL SECURITY")
    expect(migration).toContain("GRANT SELECT, UPDATE ON TABLE public.player_activity_settings")
  })
})
