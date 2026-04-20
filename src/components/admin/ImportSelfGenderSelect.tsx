"use client"

import type { ManualSelfGender } from "@/lib/matching/round-import-types"

interface Props {
  value: ManualSelfGender | null
  onChange: (value: ManualSelfGender | null) => void
  disabled?: boolean
}

export function ImportSelfGenderSelect({ value, onChange, disabled = false }: Props) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      className="w-full rounded-md border bg-background px-3 py-2 text-xs"
      onChange={(event) => {
        const next = event.target.value
        onChange(next ? (next as ManualSelfGender) : null)
      }}
    >
      <option value="">请选择本人性别</option>
      <option value="male">男</option>
      <option value="female">女</option>
      <option value="other">其他 / 不确定</option>
    </select>
  )
}
