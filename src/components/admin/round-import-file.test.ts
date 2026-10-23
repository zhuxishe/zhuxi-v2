import { describe, expect, it } from "vitest"
import { ROUND_IMPORT_MAX_FILE_BYTES, roundImportFileError } from "./round-import-file"

describe("Excel import client file validation", () => {
  it("accepts the server limit exactly and rejects an oversized file before uploading", () => {
    expect(roundImportFileError({ name: "members.xlsx", size: ROUND_IMPORT_MAX_FILE_BYTES })).toBeNull()
    expect(roundImportFileError({ name: "members.xlsx", size: ROUND_IMPORT_MAX_FILE_BYTES + 1 })).toContain("不能超过 2 MB")
    expect(roundImportFileError({ name: "members.xlsx", size: ROUND_IMPORT_MAX_FILE_BYTES + 1 })).toContain("分别预览并追加导入")
  })

  it("requires an xlsx file and accepts uppercase extensions", () => {
    expect(roundImportFileError(null)).toBe("请先选择 .xlsx 文件")
    expect(roundImportFileError({ name: "members.xls", size: 1 })).toBe("目前只支持 .xlsx 文件")
    expect(roundImportFileError({ name: "members.xlsx.exe", size: 1 })).toBe("目前只支持 .xlsx 文件")
    expect(roundImportFileError({ name: "MEMBERS.XLSX", size: 1 })).toBeNull()
  })
})
