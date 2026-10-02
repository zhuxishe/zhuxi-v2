"use client"

import { useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Triangle } from "lucide-react"
import { directoryControlsUrl, nextDirectorySort } from "@/lib/member-master/directory-controls"
import type { MemberDirectorySort } from "@/types/member-center"
import { cn } from "@/lib/utils"

export function MemberSortHeader({ label, column, sort, disabled = false }: {
  label: string
  column: "updated" | "number"
  sort: MemberDirectorySort
  disabled?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const direction = sort === `${column}_asc` ? "ascending" : sort === `${column}_desc` ? "descending" : "none"
  const next = nextDirectorySort(sort, column)
  const action = next === "default" ? "恢复默认" : next.endsWith("asc") ? "升序" : "降序"

  return (
    <th className="px-4 py-3 font-medium text-muted-foreground" aria-sort={direction}>
      {disabled ? label : (
        <button type="button" disabled={pending} aria-label={`${label}：${action}`} title={action}
          className="-my-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          onClick={() => startTransition(() => router.push(directoryControlsUrl(params.toString(), { sort: next }), { scroll: false }))}>
          {label}
          <span className="flex flex-col gap-0.5" aria-hidden="true">
            <Triangle className={cn("size-2 fill-current stroke-0", direction === "ascending" ? "text-primary" : "text-muted-foreground/30")} />
            <Triangle className={cn("size-2 rotate-180 fill-current stroke-0", direction === "descending" ? "text-primary" : "text-muted-foreground/30")} />
          </span>
        </button>
      )}
    </th>
  )
}
