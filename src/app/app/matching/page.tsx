import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerRounds, fetchSubmittedRoundIds } from "@/lib/queries/player-rounds"
import { PlayerRoundEntry } from "@/components/player/PlayerRoundEntry"

export default async function MatchingEntriesPage() {
  const player = await requirePlayer()
  const [rounds, locale, t] = await Promise.all([fetchPlayerRounds(), getLocale(), getTranslations("rounds")])
  const submittedIds = await fetchSubmittedRoundIds(player.memberId, rounds.map((round) => round.id))
  const initialNow = new Date().toISOString()
  return <div className="space-y-5 px-4 py-6">
    <Link href="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />{t("backHome")}</Link>
    <div><h1 className="heading-display text-xl">{t("title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p></div>
    {rounds.length ? rounds.map((round) => <PlayerRoundEntry key={round.id} round={round} locale={locale} initialNow={initialNow} submitted={submittedIds.includes(round.id)} />)
      : <p className="rounded-2xl bg-card p-6 text-sm text-muted-foreground">{t("empty")}</p>}
  </div>
}
