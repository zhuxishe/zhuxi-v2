import { requirePlayer } from "@/lib/auth/player"
import { fetchOpenRound, fetchMySubmission } from "@/lib/queries/rounds"
import { SurveyForm } from "@/components/player/SurveyForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function SurveyPage() {
  const player = await requirePlayer()
  const round = await fetchOpenRound()

  if (!round) {
    return (
      <div className="px-4 py-6">
        <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
          <ArrowLeft className="size-4" /> 返回首页
        </Link>
        <div className="text-center py-20">
          <p className="text-muted-foreground">当前没有进行中的问卷</p>
          <p className="text-xs text-muted-foreground mt-1">请等待工作人员开放新一期匹配</p>
        </div>
      </div>
    )
  }

  const existing = await fetchMySubmission(round.id, player.memberId)

  return (
    <div className="px-4 py-6">
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
        <ArrowLeft className="size-4" /> 返回首页
      </Link>
      <SurveyForm
        roundId={round.id}
        roundName={round.round_name}
        activityStart={round.activity_start}
        activityEnd={round.activity_end}
        existing={existing ? {
          game_type_pref: existing.game_type_pref,
          gender_pref: existing.gender_pref,
          availability: existing.availability as Record<string, string[]>,
          interest_tags: existing.interest_tags ?? [],
          social_style: existing.social_style,
          message: existing.message,
        } : null}
      />
    </div>
  )
}
