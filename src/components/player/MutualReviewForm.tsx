"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { submitReview } from "@/app/app/reviews/new/[id]/actions"
import { Button } from "@/components/ui/button"
import { PersonalitySlider } from "./PersonalitySlider"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { POSITIVE_REVIEW_TAGS, NEGATIVE_REVIEW_TAGS } from "@/lib/constants/reviews"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"

interface Props {
  reviewerId: string
  revieweeId: string
  matchResultId: string
}

export function MutualReviewForm({ reviewerId: _reviewerId, revieweeId, matchResultId }: Props) {
  const router = useRouter()
  const t = useTranslations("reviews")
  const positiveLabels = useTagLabels(POSITIVE_REVIEW_TAGS)
  const negativeLabels = useTagLabels(NEGATIVE_REVIEW_TAGS)
  const [overall, setOverall] = useState(3)
  const [punctuality, setPunctuality] = useState(3)
  const [communication, setCommunication] = useState(3)
  const [teamwork, setTeamwork] = useState(3)
  const [fun, setFun] = useState(3)
  const [wouldPlayAgain, setWouldPlayAgain] = useState(true)
  const [positiveTags, setPositiveTags] = useState<string[]>([])
  const [negativeTags, setNegativeTags] = useState<string[]>([])
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await submitReview({
      match_result_id: matchResultId,
      reviewee_id: revieweeId,
      overall_score: overall, punctuality_score: punctuality,
      communication_score: communication, teamwork_score: teamwork, fun_score: fun,
      would_play_again: wouldPlayAgain, positive_tags: positiveTags,
      negative_tags: negativeTags, comment,
    })
    setSubmitting(false)
    if (result.error) setError(result.error)
    else router.push("/app")
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">{t("scores")}</h3>
        {[
          { label: t("overall"), value: overall, set: setOverall, low: t("bad"), high: t("great") },
          { label: t("punctuality"), value: punctuality, set: setPunctuality, low: t("late"), high: t("onTime") },
          { label: t("communication"), value: communication, set: setCommunication, low: t("quiet"), high: t("active") },
          { label: t("teamwork"), value: teamwork, set: setTeamwork, low: t("solo"), high: t("teamPlayer") },
          { label: t("fun"), value: fun, set: setFun, low: t("boring"), high: t("fun") },
        ].map(({ label, value, set, low, high }) => (
          <div key={label}>
            <p className="text-sm font-medium mb-1">{label}</p>
            <PersonalitySlider value={value} onChange={set} lowLabel={low} highLabel={high} />
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
        <h3 className="text-sm font-semibold">{t("tags")}</h3>
        <div>
          <p className="text-xs text-muted-foreground mb-2">{t("positiveTags")}</p>
          <MultiTagSelect options={[...POSITIVE_REVIEW_TAGS]} value={positiveTags} onChange={setPositiveTags} labels={positiveLabels} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">{t("negativeTags")}</p>
          <MultiTagSelect options={[...NEGATIVE_REVIEW_TAGS]} value={negativeTags} onChange={setNegativeTags} labels={negativeLabels} />
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-2">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium">{t("playAgain")}</p>
          <button type="button" onClick={() => setWouldPlayAgain(!wouldPlayAgain)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${wouldPlayAgain ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
            {wouldPlayAgain ? t("yes") : t("no")}
          </button>
        </div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder={t("commentPlaceholder")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? t("submitting") : t("submit")}
      </Button>
    </div>
  )
}
