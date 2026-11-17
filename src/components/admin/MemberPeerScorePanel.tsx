import { unstable_rethrow } from "next/navigation"
import { fetchMemberPeerScore } from "@/lib/queries/member-peer-score"
import type { MemberPeerScoreResult } from "@/types/member-peer-score"
import { MemberPeerScoreCard } from "./MemberPeerScoreCard"

export async function MemberPeerScorePanel({ memberId }: { memberId: string }) {
  let result: MemberPeerScoreResult | { status: "error" }
  try {
    result = await fetchMemberPeerScore(memberId)
  } catch (error) {
    unstable_rethrow(error)
    console.error("[MemberPeerScorePanel]", error instanceof Error ? error.message : "Unknown error")
    result = { status: "error" }
  }
  return <MemberPeerScoreCard result={result} />
}
