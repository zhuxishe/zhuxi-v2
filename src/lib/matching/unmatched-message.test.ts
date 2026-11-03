import { describe, expect, it } from "vitest"
import { normalizeUnmatchedMessage, normalizeUnmatchedMemberMessages, resolveUnmatchedMessage } from "./unmatched-message"

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

describe("individual unmatched messages", () => {
  it("resolves replacement, inherited copy and explicit suppression independently", () => {
    const messages = normalizeUnmatchedMemberMessages({ a: "  给甲的说明\n请联系工作人员  ", b: null, c: " \n " }, ["a", "b", "c", "d"])
    expect(messages).toEqual({ a: "给甲的说明\n请联系工作人员", b: null })
    expect(resolveUnmatchedMessage("统一安排", messages, "a")).toBe("给甲的说明\n请联系工作人员")
    expect(resolveUnmatchedMessage("统一安排", messages, "b")).toBeNull()
    expect(resolveUnmatchedMessage("统一安排", messages, "c")).toBe("统一安排")
    expect(resolveUnmatchedMessage("统一安排", messages, "d")).toBe("统一安排")
    expect(resolveUnmatchedMessage("", messages, "a")).toBe("给甲的说明\n请联系工作人员")
    expect(resolveUnmatchedMessage("", messages, "d")).toBeNull()
  })
  it("validates each message and cohort without silently removing an outside member", () => {
    expect(normalizeUnmatchedMemberMessages(undefined)).toEqual({})
    expect(normalizeUnmatchedMemberMessages({ a: "🌿".repeat(300) }, ["a"])).toEqual({ a: "🌿".repeat(300) })
    expect(() => normalizeUnmatchedMemberMessages({ a: "🌿".repeat(301) }, ["a"])).toThrow("最多300字")
    expect(() => normalizeUnmatchedMemberMessages({ outside: "" }, ["a"])).toThrow("本批次以外")
    expect(() => normalizeUnmatchedMemberMessages({ a: 123 }, ["a"])).toThrow("须为文字")
    expect(() => normalizeUnmatchedMemberMessages(null)).toThrow("格式无效")
    expect(() => normalizeUnmatchedMemberMessages([])).toThrow("格式无效")
    expect(() => normalizeUnmatchedMemberMessages(new Date())).toThrow("格式无效")
    expect(() => normalizeUnmatchedMemberMessages(new Map())).toThrow("格式无效")
    expect(() => normalizeUnmatchedMemberMessages(JSON.parse('{"__proto__":"bad"}'))).toThrow("标识无效")
  })
  it("keeps incomplete oversized editor previews available while normalization blocks saving", () => {
    const long = "字".repeat(301)
    expect(resolveUnmatchedMessage("统一", { a: long }, "a")).toBe(long)
    expect(resolveUnmatchedMessage("统一", { a: " " }, "a")).toBe("统一")
  })
})
