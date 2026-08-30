"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { buildMemberDirectoryUrl } from "./member-center-utils"

const STATUS_OPTIONS = [
  ["all", "全部审批状态"], ["pending", "待审核"], ["approved", "已通过"],
  ["rejected", "已拒绝"], ["inactive", "已停用"],
] as const
const ACCOUNT_OPTIONS = [
  ["all", "全部账号状态"], ["unbound", "未绑定"], ["active", "正常"],
  ["suspended", "已暂停"], ["closed", "已关闭"],
] as const
const PROFILE_OPTIONS = [
  ["all", "全部资料阶段"], ["not_started", "未开始"], ["in_progress", "填写中"],
  ["submitted", "已提交"], ["complete", "已完成"],
] as const
const SOURCE_OPTIONS = [
  ["all", "全部来源"], ["app", "玩家端登记"], ["line", "LINE"],
  ["legacy", "历史记录"], ["import", "批量导入"], ["admin", "后台建立"],
] as const

interface Props {
  currentStatus: string
  currentAccountStatus: string
  currentProfileStage: string
  currentRecordSource: string
  currentSearch: string
  canSearchHighRisk: boolean
}

const SELECT_CLASS = "min-h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function MemberListFilter({
  currentStatus,
  currentAccountStatus,
  currentProfileStage,
  currentRecordSource,
  currentSearch,
  canSearchHighRisk,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchValue, setSearchValue] = useState(currentSearch)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  function updateParam(key: string, value: string) {
    router.push(buildMemberDirectoryUrl(searchParams?.toString() ?? "", key, value))
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="成员目录筛选">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FilterSelect label="审批状态" value={currentStatus} options={STATUS_OPTIONS} onChange={(value) => updateParam("status", value)} />
        <FilterSelect label="账号状态" value={currentAccountStatus} options={ACCOUNT_OPTIONS} onChange={(value) => updateParam("accountStatus", value)} />
        <FilterSelect label="资料阶段" value={currentProfileStage} options={PROFILE_OPTIONS} onChange={(value) => updateParam("profileStage", value)} />
        <FilterSelect label="记录来源" value={currentRecordSource} options={SOURCE_OPTIONS} onChange={(value) => updateParam("source", value)} />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索成员</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={searchValue}
            placeholder={canSearchHighRisk ? "姓名、昵称、邮箱、会员编号或成员主记录 ID" : "姓名、昵称、业务邮箱或成员主记录 ID"}
            className="min-h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(event) => {
              const value = event.target.value
              setSearchValue(value)
              if (timerRef.current) clearTimeout(timerRef.current)
              timerRef.current = setTimeout(() => updateParam("search", value), 300)
            }}
          />
        </label>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/members")}>
          <X className="size-4" aria-hidden="true" />
          清除筛选
        </Button>
      </div>
    </section>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: ReadonlyArray<readonly [string, string]>
  onChange: (value: string) => void
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <select className={`${SELECT_CLASS} w-full`} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}
