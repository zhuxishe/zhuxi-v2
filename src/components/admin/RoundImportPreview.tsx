"use client"

import { Badge } from "@/components/ui/badge"
import { LegacyMemberSearchSelect } from "./LegacyMemberSearchSelect"
import type { ImportPreviewRow, LegacyOption } from "@/lib/matching/round-import-types"

interface Props {
  rows: ImportPreviewRow[]
  legacyOptions: LegacyOption[]
  overrides: Record<string, string>
  onChange: (rowNumber: number, legacyId: string | null) => void
}

export function RoundImportPreview({ rows, legacyOptions, overrides, onChange }: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">老成员手动匹配</h4>
        <p className="text-xs text-muted-foreground">当前正式成员仍按精确姓名自动复用；老成员改为你手动指定。</p>
      </div>
      <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        这份 Excel 没有“成员本人的性别”字段。
        只有你手动绑定到老成员后，系统才会带入该老成员的男女信息；
        没绑定的行会按“未知/other”导入，性别偏好匹配会变弱。
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.rowNumber} className="rounded-lg border bg-background p-3 text-xs space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">第 {row.rowNumber} 行</span>
              <span>{row.name}</span>
              <Badge variant="outline">{row.gameTypePref}</Badge>
              <Badge variant="outline">偏好{row.genderPref}</Badge>
              <Badge variant="outline">{row.availabilityDays} 天有空</Badge>
            </div>

            {row.currentMatch ? (
              <div className="rounded-md bg-green-50 px-2 py-1 text-green-700">
                自动复用当前正式成员：{row.currentMatch.name}
              </div>
            ) : (
              <div className="space-y-1">
                {row.exactLegacyMatches.length > 0 && (
                  <div className="text-amber-700">
                    检测到 {row.exactLegacyMatches.length} 个同名老成员，但不会自动套用，请按姓名/性别/学校/学部手动确认。
                  </div>
                )}
                {row.warnings.includes("ambiguous_name_match") && (
                  <div className="text-red-600">当前正式成员存在重名，已禁用自动命中，请手动判断。</div>
                )}
                <LegacyMemberSearchSelect
                  value={overrides[String(row.rowNumber)] ?? null}
                  options={legacyOptions}
                  onChange={(legacyId) => onChange(row.rowNumber, legacyId)}
                />
              </div>
            )}

            {row.message && (
              <div className="text-muted-foreground">备注：{row.message}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
