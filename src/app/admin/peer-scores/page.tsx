import { notFound, unstable_rethrow } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { PeerScoreDirectory } from "@/components/admin/peer-scores/PeerScoreDirectory"
import { fetchMemberPeerScoreDirectory } from "@/lib/queries/member-peer-score-directory"
import { normalizePeerScoreDirectoryControls, type PeerScoreDirectorySearchParams } from "@/lib/member-master/peer-score-directory-controls"
import type { MemberPeerScoreDirectoryResult } from "@/types/member-peer-score-directory"

export default async function AdminPeerScoresPage({ searchParams }: { searchParams: Promise<PeerScoreDirectorySearchParams> }) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") notFound()
  const params = await searchParams
  const controls = normalizePeerScoreDirectoryControls(params)
  let result: MemberPeerScoreDirectoryResult | { status: "error" }
  try {
    result = await fetchMemberPeerScoreDirectory(params)
  } catch (error) {
    unstable_rethrow(error)
    console.error("[AdminPeerScoresPage]", error instanceof Error ? error.message : "Unknown error")
    result = { status: "error" }
  }
  return <div className="min-w-0"><AdminTopBar admin={admin} title="合拍分数" /><PeerScoreDirectory result={result} controls={controls} canSearchMemberNumber={admin.role === "super_admin"} /></div>
}
