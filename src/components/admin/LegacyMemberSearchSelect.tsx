"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { LegacyOption } from "@/lib/matching/round-import-types"

interface Props {
  value: string | null
  options: LegacyOption[]
  onChange: (value: string | null) => void
  disabled?: boolean
}

function buildLabel(option: LegacyOption) {
  const extras = [option.gender, option.school, option.department].filter(Boolean).join(" · ")
  return extras ? `${option.name}｜${extras}` : option.name
}

export function LegacyMemberSearchSelect({ value, options, onChange, disabled = false }: Props) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value])
  const selectedLabel = selected ? buildLabel(selected) : ""
  const displayValue = open || query || !selected ? query : selectedLabel

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const filtered = query.trim()
    ? options.filter((option) => buildLabel(option).toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : options.slice(0, 8)

  function handleSelect(option: LegacyOption | null) {
    onChange(option?.id ?? null)
    setQuery(option ? buildLabel(option) : "")
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        disabled={disabled}
        value={displayValue}
        placeholder="搜索老成员姓名/性别/学校/学部"
        className="w-full rounded-md border bg-background px-3 py-2 text-xs"
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          setOpen(true)
          if (!next.trim()) onChange(null)
        }}
        onFocus={() => {
          setQuery(selectedLabel)
          setOpen(true)
        }}
      />
      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-background shadow-lg">
          <button
            type="button"
            className="w-full border-b px-3 py-2 text-left text-xs hover:bg-muted"
            onClick={() => handleSelect(null)}
          >
            不使用老成员，按新临时成员导入
          </button>
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              className="w-full border-b px-3 py-2 text-left text-xs hover:bg-muted last:border-b-0"
              onClick={() => handleSelect(option)}
            >
              {buildLabel(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
