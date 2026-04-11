"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Pencil } from "lucide-react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sub = Record<string, any>

interface Props {
  submissions: Sub[]
  onEdit?: (sub: Sub) => void
  editable?: boolean
}

const GAME_TYPE_COLORS: Record<string, string> = {
  "双人": "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "多人": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "都可以": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

export function SubmissionTable({ submissions, onEdit, editable = true }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">暂无问卷提交</p>
  }

  return (
    <div className="space-y-2">
      {submissions.map((sub) => {
        const m = Array.isArray(sub.member) ? sub.member[0] : sub.member
        const identity = m?.member_identity ?? {}
        const name = identity.full_name ?? identity.nickname ?? "未知"
        const school = identity.school_name ?? ""
        const avail = (sub.availability ?? {}) as Record<string, string[]>
        const slotCount = Object.values(avail).reduce((sum, s) => sum + s.length, 0)
        const dayCount = Object.keys(avail).length
        const expanded = expandedId === sub.id

        return (
          <div key={sub.id} className="rounded-lg bg-card ring-1 ring-foreground/10">
            <button
              onClick={() => setExpandedId(expanded ? null : sub.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{name}</span>
                {school && <span className="text-xs text-muted-foreground">{school}</span>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${GAME_TYPE_COLORS[sub.game_type_pref] ?? ""}`}>
                  {sub.game_type_pref}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  性别偏好: {sub.gender_pref}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{dayCount}天 {slotCount}时段</span>
                {editable && onEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEdit(sub) }}
                    className="p-1 rounded hover:bg-muted transition-colors"
                    title="编辑问卷"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </button>
                )}
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </div>
            </button>

            {expanded && (
              <div className="border-t border-border px-4 py-3 space-y-3">
                {/* 时段 Grid */}
                <div>
                  <p className="text-xs font-medium mb-2">可用时段</p>
                  <AvailabilityMiniGrid availability={avail} />
                </div>
                {/* 兴趣标签 + 社交风格 */}
                {(sub.interest_tags?.length > 0 || sub.social_style) && (
                  <div className="flex flex-wrap gap-3">
                    {sub.interest_tags?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">题材偏好</p>
                        <div className="flex flex-wrap gap-1">
                          {sub.interest_tags.map((t: string) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {sub.social_style && (
                      <div>
                        <p className="text-xs font-medium mb-1">社交风格</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sakura/10 text-sakura">{sub.social_style}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* 留言 */}
                {sub.message && (
                  <div>
                    <p className="text-xs font-medium mb-1">给工作人员的话</p>
                    <p className="text-xs text-muted-foreground">{sub.message}</p>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  提交时间: {new Date(sub.created_at).toLocaleString("zh-CN")}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 简洁的可用时段展示 */
function AvailabilityMiniGrid({ availability }: { availability: Record<string, string[]> }) {
  const dates = Object.keys(availability).sort()
  const slots = ["上午", "下午", "晚上"]

  if (dates.length === 0) {
    return <p className="text-xs text-muted-foreground">未选择时段</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th className="pr-2 text-left font-medium text-muted-foreground">日期</th>
            {slots.map((s) => (
              <th key={s} className="px-2 text-center font-medium text-muted-foreground">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const d = new Date(date)
            const weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()]
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <tr key={date} className={isWeekend ? "bg-primary/5" : ""}>
                <td className="pr-2 py-0.5 whitespace-nowrap">
                  {date.slice(5)} ({weekday})
                </td>
                {slots.map((slot) => (
                  <td key={slot} className="px-2 py-0.5 text-center">
                    {availability[date]?.includes(slot)
                      ? <span className="inline-block size-3 rounded-sm bg-primary" />
                      : <span className="inline-block size-3 rounded-sm bg-muted" />
                    }
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
