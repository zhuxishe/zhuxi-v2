import { buildImportPreview } from "./round-import-resolver"
import { loadRoundImportContext } from "./round-import-context"
import type { LegacyOption } from "./round-import-types"

function sortLegacyOptions(options: LegacyOption[]) {
  return [...options].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
}

export async function previewRoundWorkbook(roundId: string, buffer: Buffer) {
  const { parsedRows, currentMembers, legacyMembers } = await loadRoundImportContext(roundId, buffer)
  const rows = buildImportPreview(parsedRows, currentMembers, legacyMembers)
  return {
    rows,
    legacyOptions: sortLegacyOptions(legacyMembers.map((member) => ({
      id: member.legacy_id,
      name: member.full_name,
      school: member.school,
      department: member.department,
    }))),
  }
}
