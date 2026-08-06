import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { FALLBACK_HOMEPAGE_SCHOOL_STATS, getHomepageSchoolChartItems } from "@/lib/homepage-school-stats"
import { getHomepageSchoolGradient, HeroSchoolPie } from "@/components/landing/HeroSchoolPie"

describe("getHomepageSchoolGradient", () => {
  it("uses a finite empty gradient when total membership is zero", () => {
    const stats = { totalMembers: 0, totalSchools: 0, featuredSchools: [] }
    const gradient = getHomepageSchoolGradient(getHomepageSchoolChartItems(stats), stats.totalMembers)
    expect(gradient).toBe("conic-gradient(#e5e9df 0% 100%)")
    expect(gradient).not.toContain("NaN")
    expect(gradient).not.toContain("Infinity")
  })

  it("renders the Japanese member unit as one stable text node", () => {
    const markup = renderToStaticMarkup(
      HeroSchoolPie({ stats: FALLBACK_HOMEPAGE_SCHOOL_STATS, ja: true }),
    )

    expect(markup).toContain(">135名<")
    expect(markup).not.toContain("135<!-- -->名")
  })
})
