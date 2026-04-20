import { describe, expect, it } from "vitest"
import {
  buildRoundSubmissionSelect,
  supportsImportMetadataColumn,
} from "@/lib/matching/import-metadata-column"
import { getPostgrestErrorMessage, isMissingColumnError } from "@/lib/supabase/postgrest-error"

describe("postgrest error helpers", () => {
  it("识别缺失 import_metadata 列", () => {
    const error = {
      code: "42703",
      message: "column match_round_submissions.import_metadata does not exist",
    }

    expect(isMissingColumnError(error, "import_metadata")).toBe(true)
    expect(getPostgrestErrorMessage(error, "导入失败")).toContain("import_metadata")
  })

  it("拼装导出查询字段", () => {
    expect(buildRoundSubmissionSelect(true)).toContain("import_metadata")
    expect(buildRoundSubmissionSelect(false)).not.toContain("import_metadata")
  })
})

describe("supportsImportMetadataColumn", () => {
  it("缺列时回退为 false", async () => {
    const db = {
      from: () => ({
        select: () => ({
          limit: async () => ({
            error: {
              code: "42703",
              message: "column match_round_submissions.import_metadata does not exist",
            },
          }),
        }),
      }),
    } as any

    await expect(supportsImportMetadataColumn(db)).resolves.toBe(false)
  })
})
