import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runFullMatching } from "./run-matching"
import { DEFAULT_CONFIG } from "./config"
import type { MatchCandidate, MatchingConfig } from "./types"
import type { PairRelation } from "./pair-history"

// These expected rows were captured by executing the released 457dc1c runner,
// not by recomputing expected values with the new scoring implementation.
const fixture = JSON.parse(readFileSync(join(process.cwd(), "src/lib/matching/__fixtures__/legacy-v2-replay.json"), "utf8")) as {
  capturedFromCommit: string
  config: MatchingConfig
  cases: { seed: number; candidates: MatchCandidate[]; relations: [string, PairRelation][]; idMap: [string, string][]; expected: ReturnType<typeof runFullMatching> }[]
}

describe("old v2 batches replay the released scoring behavior", () => {
  it("retains the original frozen default weights", () => {
    expect(DEFAULT_CONFIG).toEqual(fixture.config)
  })
  for (const sample of fixture.cases) {
    it(`reproduces released rows, scores, explanations and coverage for sample ${sample.seed}`, () => {
      expect(runFullMatching(structuredClone(sample.candidates), structuredClone(fixture.config), new Map(sample.idMap), new Map(sample.relations))).toEqual(sample.expected)
    })
  }
})
