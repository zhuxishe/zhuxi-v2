"use client"

import { useState, useRef, useEffect } from "react"

interface Major {
  zh: string
  ja: string
  en: string
}

 
const majors: Major[] = require("@/data/majors.json")

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function MajorSearchSelect({ value, onChange, className }: Props) {
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
    ? majors.filter((m) =>
        m.zh.includes(query) ||
        m.ja.includes(query) ||
        m.en.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  function handleSelect(m: Major) {
    onChange(m.zh)
    setQuery(m.zh)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={className}
        placeholder="输入专业名搜索或自行填写（中/日/英）"
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
          {filtered.map((m) => (
            <button
              key={m.zh}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              onClick={() => handleSelect(m)}
            >
              <span className="font-medium text-foreground">{m.zh}</span>
              <span className="text-muted-foreground ml-2 text-xs">{m.ja}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
