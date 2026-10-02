"use client"

import Link from "next/link"
import { ArrowUpRight, Check, CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { PendingApplicationItem as PendingApplication } from "@/types/pending-applications"
import { ApprovalSelectionCheckbox } from "./ApprovalSelectionCheckbox"

interface Props {
  item: PendingApplication
  selected: boolean
  onSelect: () => void
  onApprove: () => void
}

export function PendingApplicationRow({ item, selected, onSelect, onApprove }: Props) {
  const name = item.fullName || "未填写姓名"
  return (
    <li className={`grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-3 border-b border-border/60 px-3 py-4 transition-colors last:border-0 sm:px-5 lg:grid-cols-[2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_10rem_12rem] lg:items-center lg:gap-x-4 ${selected ? "bg-bamboo-muted/70" : "hover:bg-muted/30"}`}>
      <ApprovalSelectionCheckbox label={`选择 ${name}`} checked={selected} disabled={Boolean(item.blockReason)} onChange={onSelect} />
      <div className="min-w-0 self-center">
        <Link href={`/admin/members/${item.id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-primary">
          {name}
        </Link>
        {item.nickname ? <p className="mt-1 truncate text-xs text-muted-foreground">{item.nickname}</p> : null}
      </div>
      <p className="col-start-2 break-words text-sm text-muted-foreground lg:col-start-auto">
        <span className="mr-2 text-xs lg:hidden">学校</span>{item.schoolName || "未填写学校"}
      </p>
      <div className="col-start-2 text-xs leading-5 text-muted-foreground lg:col-start-auto">
        <span className="mr-2 lg:hidden">提交时间</span>
        <time dateTime={item.submittedAt ?? undefined}>{formatAdminDateTime(item.submittedAt, "未记录提交时间")}</time>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 lg:col-start-auto lg:justify-end">
        <Link href={`/admin/members/${item.id}`} className="inline-flex min-h-10 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          查看资料<ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Button type="button" variant="outline" className="min-h-10 border-primary/20 text-primary" disabled={Boolean(item.blockReason)} onClick={onApprove}>
          <Check className="size-4" aria-hidden="true" />快速通过
        </Button>
      </div>
      {item.blockReason ? (
        <p className="col-start-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 lg:col-span-4">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span><strong className="font-medium">资料待核实：</strong>{item.blockReason}</span>
        </p>
      ) : null}
    </li>
  )
}
