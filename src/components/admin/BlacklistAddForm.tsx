"use client"

import { useState, useTransition } from "react"
import { addBlacklist, searchMembersForBlacklist } from "@/app/admin/matching/blacklist/actions"

type MemberOption = { id: string; label: string }

export function BlacklistAddForm() {
  const [memberA, setMemberA] = useState<MemberOption | null>(null)
  const [memberB, setMemberB] = useState<MemberOption | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError("")
    if (!memberA || !memberB) {
      setError("请选择两位成员")
      return
    }
    if (memberA.id === memberB.id) {
      setError("不能选择同一个人")
      return
    }
    startTransition(async () => {
      const res = await addBlacklist(memberA.id, memberB.id, reason)
      if (res?.error) {
        setError(res.error)
      } else {
        setMemberA(null)
        setMemberB(null)
        setReason("")
      }
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium text-sm">添加黑名单</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MemberSearchInput
          label="成员 A"
          value={memberA}
          onChange={setMemberA}
        />
        <MemberSearchInput
          label="成员 B"
          value={memberB}
          onChange={setMemberB}
        />
      </div>
      <input
        type="text"
        placeholder="原因（选填）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "添加中..." : "添加"}
      </button>
    </div>
  )
}

/** 成员搜索输入框 */
function MemberSearchInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: MemberOption | null
  onChange: (v: MemberOption | null) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MemberOption[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  async function handleSearch(q: string) {
    setQuery(q)
    onChange(null)
    if (q.length < 1) {
      setResults([])
      setShowDropdown(false)
      return
    }
    const data = await searchMembersForBlacklist(q)
    setResults(data)
    setShowDropdown(data.length > 0)
  }

  function handleSelect(opt: MemberOption) {
    onChange(opt)
    setQuery(opt.label)
    setShowDropdown(false)
  }

  return (
    <div className="relative">
      <label className="text-xs text-muted-foreground mb-1 block">
        {label}
      </label>
      <input
        type="text"
        placeholder="搜索姓名或编号..."
        value={value ? value.label : query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {showDropdown && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-md max-h-40 overflow-auto">
          {results.map((r) => (
            <li
              key={r.id}
              onMouseDown={() => handleSelect(r)}
              className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
