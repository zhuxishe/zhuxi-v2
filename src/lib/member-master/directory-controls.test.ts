import { describe, expect, it } from "vitest"
import { directoryControlsUrl, nextDirectorySort, normalizeMemberDirectoryControls } from "./directory-controls"

describe("directory controls", () => {
  it("supports multiple schools, the missing-school option, and role-aware sorting", () => {
    expect(normalizeMemberDirectoryControls({ school: [" 早稻田大学 ", "", "早稻田大学"], sort: "number_desc", schoolOrder: "count_desc" }))
      .toEqual({ schools: ["早稻田大学", ""], sort: "number_desc", schoolOrder: "count_desc" })
    expect(normalizeMemberDirectoryControls({ school: "东京科学大学", sort: "number_desc" }, false))
      .toEqual({ schools: ["东京科学大学"], sort: "default", schoolOrder: "default" })
    expect(normalizeMemberDirectoryControls({ sort: "invalid", schoolOrder: "invalid" }))
      .toEqual({ schools: [], sort: "default", schoolOrder: "default" })
  })

  it("cycles three states and switches the active member sort column", () => {
    expect(nextDirectorySort("default", "updated")).toBe("updated_asc")
    expect(nextDirectorySort("updated_asc", "updated")).toBe("updated_desc")
    expect(nextDirectorySort("updated_desc", "updated")).toBe("default")
    expect(nextDirectorySort("updated_desc", "number")).toBe("number_asc")
  })

  it("resets pagination while preserving school selections and existing filters", () => {
    const url = directoryControlsUrl("status=approved&school=A&school=&schoolOrder=count_desc&page=3", { sort: "updated_desc" })
    const params = new URL(url, "http://localhost").searchParams
    expect(params.getAll("school")).toEqual(["A", ""])
    expect(params.get("status")).toBe("approved")
    expect(params.get("schoolOrder")).toBe("count_desc")
    expect(params.get("sort")).toBe("updated_desc")
    expect(params.has("page")).toBe(false)
  })

  it("resets only the requested controls", () => {
    expect(directoryControlsUrl("school=A&sort=number_desc&status=approved", { schools: [], schoolOrder: "default" }))
      .toBe("/admin/members?sort=number_desc&status=approved")
    expect(directoryControlsUrl("school=A&sort=number_desc", { sort: "default" }))
      .toBe("/admin/members?school=A")
    expect(directoryControlsUrl("school=A&sort=number_desc", { schools: [], sort: "default" }))
      .toBe("/admin/members")
    expect(new URL(directoryControlsUrl("", { schools: ["学校 & B", ""] }), "http://localhost").searchParams.getAll("school"))
      .toEqual(["学校 & B", ""])
  })
})
