"use client"

import { Badge } from "@/components/ui/badge"
import { ImportSelfGenderSelect } from "./ImportSelfGenderSelect"
import { LegacyMemberSearchSelect } from "./LegacyMemberSearchSelect"
import type { ImportPreviewRow, LegacyOption, ManualSelfGender } from "@/lib/matching/round-import-types"

interface Props {
  rows: ImportPreviewRow[]
  legacyOptions: LegacyOption[]
  overrides: Record<string, string>
  genderOverrides: Record<string, ManualSelfGender>
  onChange: (rowNumber: number, legacyId: string | null) => void
  onGenderChange: (rowNumber: number, gender: ManualSelfGender | null) => void
}

const genderLabel: Record<ManualSelfGender, string> = {
  male: "男",
  female: "女",
  other: "其他 / 不确定",
}

export function RoundImportPreview({
  rows,
  legacyOptions,
  overrides,
  genderOverrides,
  onChange,
  onGenderChange,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">老成员手动匹配</h4>
        <p className="text-xs text-muted-foreground">当前正式成员仍按精确姓名自动复用；老成员改为你手动指定。</p>
      </div>
      <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        这份 Excel 没有“成员本人的性别”字段。
        现在每一行都必须二选一：要么手动绑定老成员，要么手动选择本人性别；
        没选完的行不能导入。
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const key = String(row.rowNumber)
          const selectedLegacyId = overrides[key] ?? null
          const selectedGender = genderOverrides[key] ?? null
          return (
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
                    value={selectedLegacyId}
                    options={legacyOptions}
                    onChange={(legacyId) => onChange(row.rowNumber, legacyId)}
                  />
                  {selectedLegacyId ? (
                    <div className="text-green-700">已手动绑定老成员，将直接使用该老成员的本人性别。</div>
                  ) : (
                    <div className="space-y-1">
                      <ImportSelfGenderSelect
                        value={selectedGender}
                        onChange={(gender) => onGenderChange(row.rowNumber, gender)}
                      />
                      {selectedGender ? (
                        <div className="text-green-700">当前按“{genderLabel[selectedGender]}”导入本人性别。</div>
                      ) : (
                        <div className="text-red-600">未绑定老成员时，必须手动选择本人性别。</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {row.message && (
                <div className="text-muted-foreground">备注：{row.message}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
