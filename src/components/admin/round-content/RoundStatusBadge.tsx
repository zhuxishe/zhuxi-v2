export function RoundStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "草稿", cls: "bg-muted text-muted-foreground" },
    open: { label: "进行中", cls: "bg-green-100 text-green-700" },
    scheduled: { label: "待开放", cls: "bg-muted text-muted-foreground" },
    expired: { label: "已到期", cls: "bg-yellow-100 text-yellow-700" },
    invalid: { label: "时间异常", cls: "bg-destructive/10 text-destructive" },
    closed: { label: "已截止", cls: "bg-yellow-100 text-yellow-700" },
    matched: { label: "已匹配", cls: "bg-blue-100 text-blue-700" },
  }
  const value = map[status] ?? map.draft
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${value.cls}`}>{value.label}</span>
}
