import { describe, expect, it } from "vitest"
import { getMiniQuizImage } from "../../packages/miniprogram/src/lib/quiz-images"

describe("getMiniQuizImage", () => {
  it("returns a local asset for supported personality types", () => {
    expect(getMiniQuizImage("温暖规划者")).toContain("warm-planner")
  })

  it("returns null for missing types", () => {
    expect(getMiniQuizImage("不存在的类型")).toBeNull()
    expect(getMiniQuizImage("")).toBeNull()
  })
})
