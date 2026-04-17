"use client"

import { useState, useRef, useEffect } from "react"

interface Station {
  name: string
  line: string
  area: string
}

 
const stations: Station[] = require("@/data/stations.json")

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function StationSearchSelect({ value, onChange, className }: Props) {
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
    ? stations.filter((s) =>
        s.name.includes(query) ||
        s.line.includes(query) ||
        s.area.includes(query)
      ).slice(0, 8)
    : []

  function handleSelect(station: Station) {
    onChange(station.name)
    setQuery(station.name)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={className}
        placeholder={"駅名を入力して検索"}
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
          {filtered.map((s) => (
            <button
              key={`${s.name}-${s.line}`}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              onClick={() => handleSelect(s)}
            >
              <span className="font-medium text-foreground">{s.name}</span>
              <span className="text-muted-foreground ml-2 text-xs">{s.line}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
