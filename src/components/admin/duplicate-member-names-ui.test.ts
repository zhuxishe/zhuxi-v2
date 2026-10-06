import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DuplicateMemberNames } from "./DuplicateMemberNames"

describe("duplicate name reminder", () => {
  it("clearly distinguishes no duplicates from a failed scan", () => {
    const empty = renderToStaticMarkup(createElement(DuplicateMemberNames, { groups: [] }))
    expect(empty).toContain("当前未发现重名人员")
    expect(empty).not.toContain("<details")
    const failed = renderToStaticMarkup(createElement(DuplicateMemberNames, { groups: null }))
    expect(failed).toContain("重名检测暂时不可用")
    expect(failed).toContain('role="alert"')
    expect(failed).not.toContain("未发现重名")
  })

  it("keeps the list collapsed and provides a separate detail link for each member", () => {
    const html = renderToStaticMarkup(createElement(DuplicateMemberNames, { groups: [{
      name: "张三", members: [
        { id: "a", fullName: "张三", nickname: "小张", schoolName: "早稻田大学" },
        { id: "b", fullName: " 张 三 ", nickname: null, schoolName: null },
      ],
    }] }))
    expect(html).toContain("发现 1 组重名，涉及 2 条成员记录")
    expect(html).toContain("不受上方筛选和分页影响")
    expect(html).toContain("重名不代表同一人")
    expect(html).toContain("小张")
    expect(html).toContain("未填写学校")
    expect(html).toContain('href="/admin/members/a"')
    expect(html).toContain('href="/admin/members/b"')
    expect(html).not.toMatch(/<details[^>]*\bopen/)
  })
})
