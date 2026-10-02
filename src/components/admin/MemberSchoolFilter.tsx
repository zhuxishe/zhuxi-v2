"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ListFilter } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { directoryControlsUrl } from "@/lib/member-master/directory-controls"
import type { MemberSchoolOption, MemberSchoolOrder } from "@/types/member-center"
import { cn } from "@/lib/utils"

export function MemberSchoolFilter({ schools, selected, order }: {
  schools: MemberSchoolOption[]
  selected: string[]
  order: MemberSchoolOrder
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState(selected)
  const [draftOrder, setDraftOrder] = useState(order)
  const [pending, startTransition] = useTransition()
  const options = [...schools, ...selected.filter((value) => !schools.some((school) => school.value === value)).map((value) => ({ value, count: 0 }))]
  const visible = options.filter((school) => (school.value || "未填写").toLowerCase().includes(search.trim().toLowerCase()))

  function apply(values: string[], schoolOrder: MemberSchoolOrder) {
    setOpen(false)
    startTransition(() => router.push(directoryControlsUrl(params.toString(), { schools: values, schoolOrder }), { scroll: false }))
  }

  return (
    <Popover open={open} onOpenChange={(value) => {
      setOpen(value)
      if (value) { setDraft(selected); setDraftOrder(order); setSearch("") }
    }}>
      <PopoverTrigger disabled={pending} aria-label="学校筛选与分组"
        className={cn("-my-2 inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50", (selected.length > 0 || order !== "default") && "text-primary")}>
        学校{selected.length > 0 && <span className="text-xs">· 已选 {selected.length}</span>}
        <ListFilter className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" aria-label="学校筛选与分组">
        <select aria-label="学校排列" value={draftOrder} onChange={(event) => setDraftOrder(event.target.value as MemberSchoolOrder)}
          className="h-9 w-full rounded-md border border-border bg-background px-2">
          <option value="default">不分组</option>
          <option value="name_asc">按学校名称升序</option>
          <option value="name_desc">按学校名称降序</option>
          <option value="count_desc">按学校人数从多到少</option>
        </select>
        <input type="search" aria-label="搜索学校" placeholder="搜索学校" value={search} onChange={(event) => setSearch(event.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 outline-none focus:border-primary" />
        <div className="max-h-60 overflow-y-auto">
          {visible.map((school) => (
            <label key={school.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 hover:bg-muted">
              <input type="checkbox" checked={draft.includes(school.value)} className="size-4 accent-primary"
                onChange={(event) => setDraft((values) => event.target.checked ? [...values, school.value] : values.filter((value) => value !== school.value))} />
              <span className="min-w-0 flex-1 break-words">{school.value || "未填写"}</span>
              <span className="text-xs text-muted-foreground">{school.count}</span>
            </label>
          ))}
          {visible.length === 0 && <p className="py-3 text-center text-muted-foreground">无匹配学校</p>}
        </div>
        <div className="flex justify-between border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => apply([], "default")}>重置</Button>
          <Button type="button" size="sm" onClick={() => apply(draft, draftOrder)}>应用</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
