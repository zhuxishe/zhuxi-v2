import type { RoundStats } from "@/lib/matching/round-stats"

const categories = [
  { key: "male", label: "偏向男生", color: "#6ba8d9" },
  { key: "female", label: "偏向女生", color: "#df9fb7" },
  { key: "either", label: "都可以", color: "#719c81" },
  { key: "unspecified", label: "未填写／其他", color: "#a8afb9" },
] as const

export function RoundGenderPreferenceChart({ total, distribution }: {
  total: number
  distribution: RoundStats["genderPreferenceDist"]
}) {
  const items = categories.map((category) => ({ ...category, count: distribution[category.key] }))
  const segments = items.filter((item) => item.count > 0).map((item, index, active) => {
    const preceding = active.slice(0, index).reduce((sum, segment) => sum + segment.count, 0)
    const start = total ? preceding / total * 360 : 0
    const end = total ? (preceding + item.count) / total * 360 : 0
    return `${item.color} ${start}deg ${end}deg`
  })
  const description = total
    ? `本轮搭档性别倾向，共${total}人；${items.filter((item) => item.count > 0).map((item) => `${item.label}${item.count}人`).join("，")}`
    : "暂无报名，尚无搭档性别倾向统计"

  return <section aria-label="搭档性别倾向统计" className="rounded-xl bg-card p-4 shadow-soft">
    <h3 className="text-sm font-semibold">搭档性别倾向</h3>
    <p className="mt-1 text-xs text-muted-foreground">按本轮报名选择统计</p>
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:flex-nowrap">
      <div role="img" aria-label={description} className="flex size-28 shrink-0 items-center justify-center rounded-full sm:size-32"
        style={{ background: segments.length ? `conic-gradient(${segments.join(", ")})` : "var(--color-muted)" }}>
        <div aria-hidden="true" className="flex size-[76px] flex-col items-center justify-center rounded-full bg-card sm:size-[88px]">
          <span className="text-xl font-semibold tabular-nums">{total}</span><span className="mt-0.5 text-[10px] text-muted-foreground">报名人数</span>
        </div>
      </div>
      <ul className="min-w-44 flex-1 space-y-2.5 text-xs" aria-label="搭档性别倾向明细">
        {items.filter((item) => item.key !== "unspecified" || item.count > 0).map((item) => <li key={item.key} className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
          <span className="flex shrink-0 items-center gap-2 tabular-nums"><span className="font-medium">{item.count} 人</span><span className="w-12 text-right text-muted-foreground">{total ? (item.count / total * 100).toFixed(1).replace(/\.0$/, "") : "0"}%</span></span>
        </li>)}
      </ul>
    </div>
    {!total && <p className="mt-3 text-center text-xs text-muted-foreground">暂无报名，提交后会显示统计。</p>}
  </section>
}
