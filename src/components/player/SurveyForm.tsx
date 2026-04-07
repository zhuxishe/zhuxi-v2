"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { TimeGridSelector } from "./TimeGridSelector"
import { submitSurvey } from "@/app/app/matching/survey/actions"
import { Button } from "@/components/ui/button"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SCRIPT_GENRE_OPTIONS } from "@/lib/constants/scripts"

/** DB enum values — never change these */
const GAME_TYPE_VALUES = ["双人", "多人", "都可以"] as const
const GENDER_VALUES = ["男", "女", "都可以"] as const
const SOCIAL_STYLE_KEYS = ["slowWarm", "active", "listener", "wideTopics", "gentle", "competitive"] as const
const SOCIAL_STYLE_VALUES = ["慢热", "活跃", "善于倾听", "话题广", "温和", "喜欢竞技"]

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
  const t = useTranslations("survey")
  const tErr = useTranslations("errors")
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
    if (totalSlots === 0) { setError(t("noTimeSlot")); return }
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
    if (res.error) { setError(tErr.has(res.error) ? tErr(res.error) : res.error); return }
    router.push("/app/matching/survey/success")
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="text-center">
        <h1 className="heading-display text-xl">{roundName}</h1>
        <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">{t("heading")}</p>
      </div>

      {/* 游戏类型 */}
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{t("gameType.title")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["duo", "multi", "either"] as const).map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setGameType(GAME_TYPE_VALUES[i])}
              className={`rounded-xl p-3 text-center transition-all shadow-soft ${
                gameType === GAME_TYPE_VALUES[i]
                  ? "bg-primary text-primary-foreground shadow-soft-lg"
                  : "bg-card hover:bg-accent"
              }`}
            >
              <p className="text-sm font-semibold">{t(`gameType.${key}.label`)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t(`gameType.${key}.desc`)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 性别偏好 */}
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{t("gender.title")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["male", "female", "either"] as const).map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setGenderPref(GENDER_VALUES[i])}
              className={`rounded-xl py-3 text-center text-sm font-medium transition-all shadow-soft ${
                genderPref === GENDER_VALUES[i]
                  ? "bg-primary text-primary-foreground shadow-soft-lg"
                  : "bg-card hover:bg-accent"
              }`}
            >
              {t(`gender.${key}`)}
            </button>
          ))}
        </div>
      </section>

      {/* 14天时段选择 */}
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{t("timeSlots.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("timeSlots.hint")}</p>
        <TimeGridSelector
          startDate={activityStart}
          endDate={activityEnd}
          value={availability}
          onChange={setAvailability}
        />
      </section>

      {/* 兴趣标签 */}
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{t("interestTags")}</h2>
        <MultiTagSelect
          options={[...SCRIPT_GENRE_OPTIONS]}
          value={interestTags}
          onChange={setInterestTags}
        />
      </section>

      {/* 社交风格 */}
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{t("socialStyle.title")}</h2>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_STYLE_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setSocialStyle(socialStyle === SOCIAL_STYLE_VALUES[i] ? "" : SOCIAL_STYLE_VALUES[i])}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                socialStyle === SOCIAL_STYLE_VALUES[i]
                  ? "bg-sakura text-white shadow-sm"
                  : "bg-muted hover:bg-accent text-muted-foreground"
              }`}
            >
              {t(`socialStyle.${key}`)}
            </button>
          ))}
        </div>
      </section>

      {/* 留言 */}
      <section className="space-y-3">
        <h2 className="heading-display text-sm">{t("message.title")}</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("message.placeholder")}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </section>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-md shadow-[0_-2px_12px_oklch(0.18_0.02_45/6%)] p-4 pb-[env(safe-area-inset-bottom)]">
        <Button onClick={handleSubmit} disabled={submitting || totalSlots === 0} className="w-full">
          {submitting ? t("submitting") : existing ? t("update") : t("submit")}
        </Button>
        {totalSlots === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-2">{t("noTimeSlotHint")}</p>
        )}
      </div>
    </div>
  )
}
