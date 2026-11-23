import { unstable_rethrow } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { NoMatchRequestsList } from "@/components/admin/peer-no-match/NoMatchRequestsList"
import { normalizePeerNoMatchFilter, normalizePeerNoMatchPage } from "@/lib/peer-no-match/admin-validation"
import { fetchAdminPeerNoMatchRequests } from "@/lib/queries/admin-peer-no-match-requests"
import type { AdminPeerNoMatchRequestsResult } from "@/lib/peer-no-match/admin-types"
import { resolvePeerNoMatchRequestAction } from "./actions"

export default async function AdminNoMatchRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const admin = await requireAdmin()
  const params = await searchParams
  const status = normalizePeerNoMatchFilter(params.status)
  let result: AdminPeerNoMatchRequestsResult | { status: "error" }
  try {
    result = await fetchAdminPeerNoMatchRequests({ status, page: normalizePeerNoMatchPage(params.page) })
  } catch (error) {
    unstable_rethrow(error)
    console.error("[AdminNoMatchRequestsPage]", error instanceof Error ? error.message : "Unknown error")
    result = { status: "error" }
  }
  return <div><AdminTopBar admin={admin} title="不再配对申请" /><NoMatchRequestsList result={result} status={status} action={resolvePeerNoMatchRequestAction} /></div>
}
