"use client"

import { useState, useRef, useEffect } from "react"

interface MemberOption {
  id: string
  name: string
}

interface Props {
  members: MemberOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  label: string
}

export function MemberMultiSelect({ members, selected, onChange, label }: Props) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const filtered = search
    ? members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : members

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const selectedNames = members
    .filter((m) => selected.includes(m.id))
    .map((m) => m.name)

  return (
    <div ref={containerRef}>
      <label className="text-xs font-medium mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary min-h-[36px]"
      >
        {selectedNames.length > 0 ? (
          <span className="text-foreground">{selectedNames.join(", ")}</span>
        ) : (
          <span className="text-muted-foreground">点击选择...</span>
        )}
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
          <div className="sticky top-0 bg-background p-2 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索成员..."
              className="w-full rounded border border-border bg-muted px-2 py-1 text-xs outline-none"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">无匹配成员</p>
          ) : (
            filtered.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggle(m.id)}
                  className="rounded"
                />
                {m.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}
