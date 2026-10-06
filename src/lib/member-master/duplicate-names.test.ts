import { describe, expect, it } from "vitest"
import { groupDuplicateMemberNames, type DuplicateNameMember } from "./duplicate-names"

const member = (id: string, fullName: string): DuplicateNameMember => ({ id, fullName, nickname: null, schoolName: null })

describe("duplicate real names", () => {
  it("groups distinct members while ignoring whitespace, character width and Latin case", () => {
    const groups = groupDuplicateMemberNames([
      member("a", "张三"), member("b", " 张　 三 "),
      member("c", "Ａｌｉｃｅ"), member("d", "alice"),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.members.map((row) => row.id)))
      .toEqual(expect.arrayContaining([["a", "b"], ["c", "d"]]))
  })

  it("does not count blank names, repeated records, matching nicknames or similar names", () => {
    const first = { ...member("a", "张三"), nickname: "小溪" }
    expect(groupDuplicateMemberNames([
      first, first, { ...member("b", "李四"), nickname: "小溪" },
      member("c", ""), member("d", "　 "), member("e", "張三"), member("f", "张山"),
    ])).toEqual([])
  })

  it("shows larger groups first and retains each member's detail fields", () => {
    const named = { ...member("a", "张三"), nickname: "小张", schoolName: "早稻田大学" }
    const groups = groupDuplicateMemberNames([
      named, member("b", "张三"), member("c", "王五"), member("d", "王五"), member("e", "王五"),
    ])
    expect(groups.map((group) => group.members.length)).toEqual([3, 2])
    expect(groups[1].members[0]).toEqual(named)
  })
})
