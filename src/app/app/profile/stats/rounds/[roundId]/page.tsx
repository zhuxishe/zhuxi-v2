import { notFound, redirect } from "next/navigation"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerParticipationDetail } from "@/lib/queries/player-participation"
import { participationRecordHref } from "@/lib/matching/participation-display"

/** Keep saved links working without bypassing the original ownership check. */
export default async function LegacyParticipationRecordPage({ params }: { params: Promise<{ roundId: string }> }) {
  const player = await requirePlayer()
  const { roundId } = await params
  const record = await fetchPlayerParticipationDetail(player.memberId, roundId)
  if (!record) notFound()
  redirect(participationRecordHref(record.round.id))
}
