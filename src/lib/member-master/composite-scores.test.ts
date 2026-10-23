import { describe, expect, it } from "vitest"
import { compositeScoreFormValues, normalizeMemberCompositeScores, validateCompositeScoreValues } from "./composite-scores"

const empty = {
  member_id: "member-id", attractiveness_score: null, sexual_value_score: null,
  economic_value_score: null, emotional_value_score: null, updated_at: null,
}

describe("shared composite scores", () => {
  it("shows 3 for missing scores without converting the stored unscored state", () => {
    const source = { ...empty, attractiveness_score: 4 }
    expect(compositeScoreFormValues(source)).toEqual({
      attractiveness_score: 4, sexual_value_score: 3, economic_value_score: 3, emotional_value_score: 3,
    })
    expect(source.sexual_value_score).toBeNull()
    expect(source.updated_at).toBeNull()
    expect(normalizeMemberCompositeScores(empty)).toEqual(empty)
  })

  it("accepts only four integer scores from 1 to 5, ignoring unrelated injected fields", () => {
    const valid = { attractiveness_score: 1, sexual_value_score: 2, economic_value_score: 4, emotional_value_score: 5 }
    expect(validateCompositeScoreValues({ ...valid, interview_date: "2000-01-01", communication: 5 })).toEqual(valid)
    for (const value of [null, undefined, "3", 0, 6, 2.5, Number.NaN]) {
      expect(validateCompositeScoreValues({ ...valid, sexual_value_score: value })).toBeNull()
    }
    expect(validateCompositeScoreValues(null)).toBeNull()
    expect(validateCompositeScoreValues([])).toBeNull()
  })

  it("rejects broken RPC data rather than displaying it as an unscored member", () => {
    expect(() => normalizeMemberCompositeScores(null)).toThrow()
    expect(() => normalizeMemberCompositeScores({ ...empty, member_id: "" })).toThrow()
    expect(() => normalizeMemberCompositeScores({ ...empty, emotional_value_score: 6 })).toThrow()
    expect(() => normalizeMemberCompositeScores({ ...empty, updated_at: undefined })).toThrow()
    expect(() => normalizeMemberCompositeScores({ ...empty, updated_at: "not-a-version" })).toThrow()
  })
})
