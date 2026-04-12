import { describe, expect, it } from "vitest"
import { getSingleRelation } from "@/lib/supabase/relations"

describe("getSingleRelation", () => {
  it("returns the same object for one-to-one joins", () => {
    expect(getSingleRelation({ full_name: "A" })).toEqual({ full_name: "A" })
  })

  it("unwraps the first row for array-shaped joins", () => {
    expect(getSingleRelation([{ full_name: "A" }])).toEqual({ full_name: "A" })
  })

  it("returns null for empty arrays and nullish values", () => {
    expect(getSingleRelation([])).toBeNull()
    expect(getSingleRelation(null)).toBeNull()
    expect(getSingleRelation(undefined)).toBeNull()
  })
})
