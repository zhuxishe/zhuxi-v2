import { describe, expect, it } from "vitest"
import {
  buildMiniPersonalityForm,
  EMPTY_MINI_PERSONALITY,
  isMiniPersonalityComplete,
} from "../../packages/miniprogram/src/lib/personality-form"

describe("mini personality form helpers", () => {
  it("fills missing fields from defaults", () => {
    const result = buildMiniPersonalityForm({
      extroversion: 5,
      expression_style_tags: ["温和"],
      warmup_speed: null,
    })

    expect(result).toEqual({
      ...EMPTY_MINI_PERSONALITY,
      extroversion: 5,
      expression_style_tags: ["温和"],
    })
  })

  it("still marks incomplete data as incomplete for dashboard progress", () => {
    expect(isMiniPersonalityComplete(EMPTY_MINI_PERSONALITY)).toBe(false)

    expect(isMiniPersonalityComplete({
      extroversion: 4,
      initiative: 4,
      expression_style_tags: ["温和"],
      group_role_tags: ["组织者"],
      warmup_speed: "先浅后深",
      planning_style: "半计划",
      coop_compete_tendency: "均衡",
      emotional_stability: 3,
      boundary_strength: "适中",
      reply_speed: "当天",
    })).toBe(true)
  })

  it("allows partial data to be merged and saved without becoming complete", () => {
    const partial = buildMiniPersonalityForm({
      extroversion: 4,
      expression_style_tags: ["温和"],
    })

    expect(partial.extroversion).toBe(4)
    expect(partial.expression_style_tags).toEqual(["温和"])
    expect(isMiniPersonalityComplete(partial)).toBe(false)
  })
})
