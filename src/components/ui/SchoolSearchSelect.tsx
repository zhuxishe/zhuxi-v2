"use client"

import { useState, useRef, useEffect } from "react"

interface University {
  zh: string
  ja: string
  en: string
  short?: string
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const universities: University[] = require("@/data/universities.json")

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SchoolSearchSelect({ value, onChange, className }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const filtered = query.trim()
    ? universities.filter((u) =>
        u.zh.includes(query) ||
        u.ja.includes(query) ||
        u.en.toLowerCase().includes(query.toLowerCase()) ||
        u.short?.includes(query)
      ).slice(0, 8)
    : []

  function handleSelect(uni: University) {
    onChange(uni.zh)
    setQuery(uni.zh)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={className}
        placeholder="输入学校名搜索（中/日/英）"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          onChange(e.target.value)
        }}
        onFocus={() => { if (query.trim()) setOpen(true) }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtered.map((uni) => (
            <button
              key={uni.zh}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              onClick={() => handleSelect(uni)}
            >
              <span className="font-medium text-foreground">{uni.zh}</span>
              <span className="text-muted-foreground ml-2 text-xs">{uni.ja}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
