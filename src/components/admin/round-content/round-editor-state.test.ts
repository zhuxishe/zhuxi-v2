import { describe, expect, it } from "vitest"
import { normalizeRoundConfig } from "@/lib/matching/round-config"
import type { RoundContentDraft } from "@/types"
import { changeRoundPurpose } from "./round-editor-state"

const draft: RoundContentDraft = {
  roundName: "迎新派对", purpose: "registration", surveyStart: "2026-10-01T00:00", surveyEnd: "2026-10-10T12:00",
  activityStart: "2026-10-10", activityEnd: "2026-10-11",
  contentConfig: normalizeRoundConfig({ eventStart: "2026-10-10T06:00:00Z", eventEnd: "2026-10-10T08:00:00Z", introduction: { zh: "一起认识新朋友", ja: "" }, location: { zh: "东京", ja: "" } }),
}

describe("round editor purpose changes", () => {
  it("clears fixed event times when switching registration to availability matching", () => {
    const next = changeRoundPurpose(draft, "matching")
    expect(next.purpose).toBe("matching")
    expect(next.contentConfig.eventStart).toBe("")
    expect(next.contentConfig.eventEnd).toBe("")
    expect(next.activityStart).toBe(draft.activityStart)
    expect(next.activityEnd).toBe(draft.activityEnd)
    expect(next.contentConfig.introduction).toEqual(draft.contentConfig.introduction)
    expect(next.contentConfig.location).toEqual(draft.contentConfig.location)
    expect(draft.contentConfig.eventStart).toBe("2026-10-10T06:00:00Z")
  })

  it("clears fixed event times for announcement-to-matching as well", () => {
    expect(changeRoundPurpose({ ...draft, purpose: "announcement" }, "matching").contentConfig.eventStart).toBe("")
  })

  it("keeps fixed event times when switching between fixed activity uses", () => {
    const next = changeRoundPurpose(draft, "announcement")
    expect(next.contentConfig.eventStart).toBe(draft.contentConfig.eventStart)
    expect(next.contentConfig.eventEnd).toBe(draft.contentConfig.eventEnd)
  })
})
