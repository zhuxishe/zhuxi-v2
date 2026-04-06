"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TimeGridSelector } from "./TimeGridSelector"
import { submitSurvey } from "@/app/app/matching/survey/actions"
import { Button } from "@/components/ui/button"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"

const GAME_TYPE_OPTIONS = [
  { value: "双人", label: "双人本", desc: "1对1 深度交流" },
  { value: "多人", label: "多人本", desc: "3-6人 热闹社交" },
  { value: "都可以", label: "都可以", desc: "交给我们安排" },
] as const

const GENDER_OPTIONS = [
  { value: "男", label: "男生搭档" },
  { value: "女", label: "女生搭档" },
  { value: "都可以", label: "都可以" },
] as const

const SOCIAL_STYLES = ["慢热", "活跃", "善于倾听", "话题广", "温和", "喜欢竞技"]

interface Props {
  roundId: string
  roundName: string
  activityStart: string
  activityEnd: string
  existing?: {
    game_type_pref: string
    gender_pref: string
    availability: Record<string, string[]>
    interest_tags: string[]
    social_style: string | null
    message: string | null
  } | null
}

export function SurveyForm({ roundId, roundName, activityStart, activityEnd, existing }: Props) {
  const router = useRouter()
  const [gameType, setGameType] = useState(existing?.game_type_pref ?? "都可以")
  const [genderPref, setGenderPref] = useState(existing?.gender_pref ?? "都可以")
  const [availability, setAvailability] = useState<Record<string, string[]>>(existing?.availability ?? {})
  const [interestTags, setInterestTags] = useState<string[]>(existing?.interest_tags ?? [])
  const [socialStyle, setSocialStyle] = useState(existing?.social_style ?? "")
  const [message, setMessage] = useState(existing?.message ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalSlots = Object.values(availability).reduce((s, v) => s + v.length, 0)

  async function handleSubmit() {
    if (totalSlots === 0) { setError("请至少选择一个可用时段"); return }
    setSubmitting(true)
    setError(null)
    const res = await submitSurvey({
      roundId,
      gameTypePref: gameType,
      genderPref,
      availability,
      interestTags,
      socialStyle: socialStyle || null,
      message: message.trim() || null,
    })
    setSubmitting(false)
    if (res.error) { setError(res.error); return }
    router.push("/app/matching/survey/success")
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="text-center">
        <h1 className="text-lg font-bold">{roundName}</h1>
        <p className="text-xs text-muted-foreground mt-1">填写你的匹配偏好</p>
      </div>

      {/* 游戏类型 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">想玩什么类型？</h2>
        <div className="grid grid-cols-3 gap-2">
          {GAME_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGameType(opt.value)}
              className={`rounded-xl p-3 text-center transition-all ring-1 ${
                gameType === opt.value
                  ? "ring-primary bg-primary/10 shadow-sm"
                  : "ring-foreground/10 hover:ring-foreground/20"
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 性别偏好 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">搭档性别偏好？</h2>
        <div className="grid grid-cols-3 gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGenderPref(opt.value)}
              className={`rounded-xl py-3 text-center text-sm font-medium transition-all ring-1 ${
                genderPref === opt.value
                  ? "ring-primary bg-primary/10"
                  : "ring-foreground/10 hover:ring-foreground/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* 14天时段选择 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">你的可用时段</h2>
        <p className="text-xs text-muted-foreground">选择你方便参加活动的时间段（可多选）</p>
        <TimeGridSelector
          startDate={activityStart}
          endDate={activityEnd}
          value={availability}
          onChange={setAvailability}
        />
      </section>

      {/* 兴趣标签 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">感兴趣的题材（可选）</h2>
        <MultiTagSelect
          options={[...SCRIPT_GENRE_OPTIONS]}
          value={interestTags}
          onChange={setInterestTags}
        />
      </section>

      {/* 社交风格 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">你的社交风格（可选）</h2>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSocialStyle(socialStyle === s ? "" : s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ring-1 ${
                socialStyle === s
                  ? "ring-primary bg-primary/10"
                  : "ring-foreground/10 hover:ring-foreground/20"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* 留言 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">想对工作人员说的话（可选）</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="比如：想和上次的搭档再玩一次..."
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </section>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border p-4 safe-area-bottom">
        <Button onClick={handleSubmit} disabled={submitting || totalSlots === 0} className="w-full">
          {submitting ? "提交中..." : existing ? "更新问卷" : "提交问卷"}
        </Button>
      </div>
    </div>
  )
}
