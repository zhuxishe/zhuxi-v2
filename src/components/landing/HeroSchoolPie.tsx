import {
  getHomepageSchoolChartItems,
  type HomepageSchoolChartItem,
  type HomepageSchoolStats,
} from "@/lib/homepage-school-stats"

export type HeroSchoolPieViewport = "responsive" | "mobile" | "desktop"

const EMPTY_CHART_COLOR = "#e5e9df"
const viewportClasses = {
  responsive: {
    card: "p-3 md:p-4", grid: "grid-cols-[5.7rem_1fr] gap-3 md:grid-cols-[7rem_1fr] md:gap-5",
    chart: "size-[5.25rem] md:size-28", center: "size-[3.5rem] md:size-[4.3rem]",
    total: "text-3xl md:text-4xl", legend: "grid-cols-2 text-[10.5px] md:grid-cols-4 md:text-xs",
  },
  mobile: {
    card: "p-3", grid: "grid-cols-[5.7rem_1fr] gap-3", chart: "size-[5.25rem]",
    center: "size-[3.5rem]", total: "text-3xl", legend: "grid-cols-2 text-[10.5px]",
  },
  desktop: {
    card: "p-4", grid: "grid-cols-[7rem_1fr] gap-5", chart: "size-28",
    center: "size-[4.3rem]", total: "text-4xl", legend: "grid-cols-4 text-xs",
  },
} as const

export function getHomepageSchoolGradient(items: HomepageSchoolChartItem[], total: number) {
  if (!Number.isFinite(total) || total <= 0) return `conic-gradient(${EMPTY_CHART_COLOR} 0% 100%)`
  let cursor = 0
  const stops: string[] = []
  for (const item of items) {
    if (!Number.isFinite(item.count) || item.count <= 0) continue
    const start = cursor
    cursor = Math.min(100, cursor + (item.count / total) * 100)
    stops.push(`${item.color} ${start}% ${cursor}%`)
  }
  return `conic-gradient(${stops.length > 0 ? stops.join(", ") : `${EMPTY_CHART_COLOR} 0% 100%`})`
}

export function HeroSchoolPie({
  stats,
  ja,
  viewport = "responsive",
}: {
  stats: HomepageSchoolStats
  ja: boolean
  viewport?: HeroSchoolPieViewport
}) {
  const items = getHomepageSchoolChartItems(stats)
  const classes = viewportClasses[viewport]
  const totalLabel = `${stats.totalMembers}${ja ? "名" : "人"}`
  return (
    <div className={`rounded-[1.15rem] border border-white/55 bg-white/80 shadow-[0_12px_30px_rgba(43,53,35,0.12)] backdrop-blur-md ${classes.card}`}>
      <div className={`grid items-center ${classes.grid}`}>
        <div
          role="img"
          aria-label={ja ? `${stats.totalSchools}校、${stats.totalMembers}名の分布` : `${stats.totalSchools} 所学校、${stats.totalMembers} 人的分布`}
          className={`relative mx-auto grid place-items-center rounded-full ${classes.chart}`}
          style={{ background: getHomepageSchoolGradient(items, stats.totalMembers) }}
        >
          <div className={`grid place-items-center rounded-full bg-[#fffdf7] text-center shadow-inner ${classes.center}`}>
            <span className={`font-display font-bold leading-none text-[#171717] ${classes.total}`}>{stats.totalSchools}</span>
            <span className="-mt-1 text-[10px] font-semibold text-[#5f8549]">{ja ? "校" : "所"}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[#5f8549]">
            <span>{ja ? "学校分布" : "社员学校分布"}</span>
            <span>{totalLabel}</span>
          </div>
          <div className={`grid gap-1 ${classes.legend}`}>
            {items.map((item) => (
              <div key={item.id} className="flex min-w-0 items-center justify-between gap-1.5 rounded-full bg-[#fffdf7]/85 px-2 py-1 font-semibold text-[#343a30]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{ja ? item.ja : item.zh}</span>
                </span>
                <span className="shrink-0 text-[#6b8f4e]">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
