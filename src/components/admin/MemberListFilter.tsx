"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { FilterBar } from "@/components/shared/FilterBar"
import { Search } from "lucide-react"

const STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待面试" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "inactive", label: "已停用" },
]

interface Props {
  currentStatus: string
  currentSearch: string
}

export function MemberListFilter({ currentStatus, currentSearch }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "")
    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/admin/members?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <FilterBar
        options={STATUS_OPTIONS}
        value={currentStatus}
        onChange={(v) => updateParam("status", v)}
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          defaultValue={currentSearch}
          placeholder="搜索姓名/昵称/学校..."
          className="w-full sm:w-60 rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          onChange={(e) => {
            const timer = setTimeout(() => updateParam("search", e.target.value), 300)
            return () => clearTimeout(timer)
          }}
        />
      </div>
    </div>
  )
}
