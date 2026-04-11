"use client"

import { useState, useTransition, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { updateSubmission, createSubmission } from "@/app/admin/matching/rounds/[id]/actions"
import { SCENARIO_THEME_OPTIONS } from "@/lib/constants/supplementary"

const GAME_TYPES = ["双人", "多人", "都可以"] as const
const GENDER_PREFS = ["男", "女", "都可以"] as const
const SLOTS = ["上午", "下午", "晚上"] as const
const SOCIAL_STYLES = ["慢热", "活跃", "善于倾听", "话题广", "温和", "喜欢竞技"] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sub = Record<string, any>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  roundId: string
  mode: "edit" | "create"
  submission?: Sub | null
  availableMembers?: { id: string; name: string }[]
  activityStart: string
  activityEnd: string
  onSaved: () => void
}

/** 生成日期范围 */
function generateDates(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start)
  const last = new Date(end)
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export function SubmissionEditDialog({
  open, onOpenChange, roundId, mode, submission,
  availableMembers, activityStart, activityEnd, onSaved,
}: Props) {
  const dates = useMemo(() => generateDates(activityStart, activityEnd), [activityStart, activityEnd])

  // 表单状态
  const [memberId, setMemberId] = useState("")
  const [gameType, setGameType] = useState(submission?.game_type_pref ?? "都可以")
  const [genderPref, setGenderPref] = useState(submission?.gender_pref ?? "都可以")
  const [availability, setAvailability] = useState<Record<string, string[]>>(
    () => (submission?.availability as Record<string, string[]>) ?? {},
  )
  const [interestTags, setInterestTags] = useState<string[]>(
    () => (submission?.interest_tags as string[]) ?? [],
  )
  const [socialStyle, setSocialStyle] = useState(submission?.social_style ?? "")
  const [message, setMessage] = useState(submission?.message ?? "")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const toggleSlot = (date: string, slot: string) => {
    setAvailability((prev) => {
      const cur = prev[date] ?? []
      const next = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot]
      const copy = { ...prev }
      if (next.length === 0) delete copy[date]
      else copy[date] = next
      return copy
    })
  }

  const toggleTag = (tag: string) => {
    setInterestTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const handleSave = () => {
    if (mode === "create" && !memberId) { setError("请选择成员"); return }
    const slotCount = Object.values(availability).reduce((s, a) => s + a.length, 0)
    if (slotCount === 0) { setError("请至少选择一个时段"); return }

    startTransition(async () => {
      setError("")
      const data = {
        game_type_pref: gameType,
        gender_pref: genderPref,
        availability,
        interest_tags: interestTags,
        social_style: socialStyle || null,
        message: message || null,
      }
      const res = mode === "edit"
        ? await updateSubmission(submission!.id, data)
        : await createSubmission(roundId, memberId, data)

      if (res.error) { setError(res.error); return }
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑问卷" : "新增问卷"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 成员选择（仅新增模式） */}
          {mode === "create" && (
            <div>
              <label className="text-xs font-medium">选择成员</label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择…</option>
                {availableMembers?.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 游戏类型 + 性别偏好 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">游戏类型</label>
              <select
                value={gameType}
                onChange={(e) => setGameType(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {GAME_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">性别偏好</label>
              <select
                value={genderPref}
                onChange={(e) => setGenderPref(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {GENDER_PREFS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          {/* 可用时段 Grid */}
          <div>
            <label className="text-xs font-medium">可用时段</label>
            <div className="mt-1 overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="pr-2 text-left font-medium text-muted-foreground">日期</th>
                    {SLOTS.map((s) => (
                      <th key={s} className="px-3 text-center font-medium text-muted-foreground">{s}</th>
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
                        <td className="pr-2 py-1 whitespace-nowrap">
                          {date.slice(5)} ({weekday})
                        </td>
                        {SLOTS.map((slot) => {
                          const active = availability[date]?.includes(slot)
                          return (
                            <td key={slot} className="px-3 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => toggleSlot(date, slot)}
                                className={`inline-block size-5 rounded-sm transition-colors ${
                                  active
                                    ? "bg-primary hover:bg-primary/80"
                                    : "bg-muted hover:bg-muted-foreground/20"
                                }`}
                              />
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

          {/* 题材偏好 */}
          <div>
            <label className="text-xs font-medium">题材偏好</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SCENARIO_THEME_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    interestTags.includes(tag)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 社交风格 */}
          <div>
            <label className="text-xs font-medium">社交风格</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SOCIAL_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setSocialStyle(socialStyle === style ? "" : style)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    socialStyle === style
                      ? "bg-sakura/20 text-sakura ring-1 ring-sakura/30"
                      : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* 留言 */}
          <div>
            <label className="text-xs font-medium">给工作人员的话</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
              placeholder="选填"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
