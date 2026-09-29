import Link from "next/link"
import { CheckCircle } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { redirect } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerRound } from "@/lib/queries/player-rounds"
import { fetchMySubmission } from "@/lib/queries/rounds"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { roundHref } from "@/lib/matching/round-display"
import { getSurveyWindowState } from "@/lib/matching/survey-window"

export default async function SurveySuccessPage({ searchParams }: { searchParams: Promise<{ roundId?: string }> }) {
  const player = await requirePlayer()
  const { roundId } = await searchParams
  if (!roundId) redirect("/app/matching")
  const round = await fetchPlayerRound(roundId)
  if (!round || getRoundPurpose(round.purpose) === "announcement") redirect("/app/matching")
  const submission = await fetchMySubmission(roundId, player.memberId)
  if (!submission) redirect(roundHref(roundId))
  const t = await getTranslations("survey")
  const registration = getRoundPurpose(round.purpose) === "registration"

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <CheckCircle className="size-16 text-green-500 mb-4" />
      <h1 className="text-lg font-bold mb-2">{t(registration ? "registration.successTitle" : "success.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t(registration ? "registration.successDescription" : "success.description")}
      </p>
      <div className="flex gap-3">
        <Link href="/app">
          <Button>{t("success.backToHome")}</Button>
        </Link>
        {getSurveyWindowState(round) === "open" && <Link href={roundHref(roundId)}>
          <Button variant="outline">{t(registration ? "registration.update" : "success.editSurvey")}</Button>
        </Link>}
      </div>
    </div>
  )
}
