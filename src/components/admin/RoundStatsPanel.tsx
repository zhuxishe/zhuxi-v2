import { calendarDateRange, calendarWeekday } from "@/lib/calendar-date"
import type { RoundStats } from "@/lib/matching/round-stats"
import { RoundGenderPreferenceChart } from "./RoundGenderPreferenceChart"

interface Props {
  stats: RoundStats
  activityStart: string
  activityEnd: string
}

export function RoundStatsPanel({ stats, activityStart, activityEnd }: Props) {
  const { total, gameTypeDist } = stats

  // 生成日期范围
  const dates = calendarDateRange(activityStart, activityEnd)
  const slots = ["上午", "下午", "晚上"]

  // 计算热力图最大值
  const maxCount = Math.max(1, ...Object.values(stats.slotCounts))

  return (
    <div className="space-y-4">
      {/* KPI 卡片 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,1fr)]">
        <div className="flex flex-col gap-2">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3" aria-label="本轮报名人数统计">
            <KpiCard label="总报名" value={total} />
            <KpiCard label="双人" value={gameTypeDist.duo} color="text-pink-600" />
            <KpiCard label="多人" value={gameTypeDist.multi} color="text-blue-600" />
            <KpiCard label="都可以" value={gameTypeDist.either} />
            <KpiCard label="男生" value={stats.genderDist.male} color="text-blue-600" />
            <KpiCard label="女生" value={stats.genderDist.female} color="text-pink-600" />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">统计当前未取消的报名；男生、女生仅统计本人性别明确选择男或女的报名者。</p>
        </div>
        <RoundGenderPreferenceChart total={total} distribution={stats.genderPreferenceDist} />
      </div>

      {/* 时段热力图 */}
      {total > 0 && (
        <div className="rounded-xl bg-card p-4 shadow-soft">
          <h4 className="text-xs font-semibold mb-3">时段热力图</h4>
          <div className="overflow-x-auto">
            <table className="text-[10px] w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted-foreground pr-2 pb-1">日期</th>
                  {slots.map((s) => (
                    <th key={s} className="text-center font-medium text-muted-foreground px-1 pb-1">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const dayOfWeek = calendarWeekday(date)
                  const weekday = ["日", "月", "火", "水", "木", "金", "土"][dayOfWeek]
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                  return (
                    <tr key={date}>
                      <td className={`pr-2 py-0.5 whitespace-nowrap ${isWeekend ? "font-semibold" : ""}`}>
                        {date.slice(5)} ({weekday})
                      </td>
                      {slots.map((slot) => {
                        const count = stats.slotCounts[`${date}_${slot}`] ?? 0
                        const intensity = count / maxCount
                        return (
                          <td key={slot} className="px-1 py-0.5 text-center">
                            <div
                              className="mx-auto flex size-6 items-center justify-center rounded text-[9px] font-medium"
                              style={{
                                backgroundColor: count > 0
                                  ? `oklch(0.7 0.15 145 / ${0.15 + intensity * 0.7})`
                                  : "var(--color-muted)",
                                color: intensity > 0.5 ? "white" : undefined,
                              }}
                            >
                              {count || ""}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg bg-card p-3 shadow-soft text-center" role="group" aria-label={`${label}：${value}人`}>
      <p className={`text-xl font-bold ${color ?? ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
