import { describe, expect, it } from "vitest"
import { normalizeUnmatchedMessage } from "./unmatched-message"

describe("optional public unmatched message", () => {
  it.each([undefined, null, "", " \n\t "])("keeps %s empty without inventing player copy", (value) => {
    expect(normalizeUnmatchedMessage(value)).toBeNull()
  })
  it("trims outer whitespace while preserving line breaks and literal text", () => {
    expect(normalizeUnmatchedMessage("  后续会再协调\n<script>literal</script>  ")).toBe("后续会再协调\n<script>literal</script>")
  })
  it("uses Unicode character length, including emoji, and rejects invalid or excessive input", () => {
    expect(normalizeUnmatchedMessage("🌸".repeat(300))).toHaveLength(600)
    expect(() => normalizeUnmatchedMessage("🌸".repeat(301))).toThrow("最多300字")
    expect(() => normalizeUnmatchedMessage({ text: "not plain text" })).toThrow("须为文字")
  })
})
