"use client"

import Link from "next/link"
import { confirmActivityReviewNavigation } from "@/components/admin/activity-reviews/use-unsaved-activity-reviews"
import { PEER_NO_MATCH_STATUS_LABELS, type PeerNoMatchRequestFilter } from "@/lib/peer-no-match/admin-types"

export function NoMatchRequestFilters({ status }: { status: PeerNoMatchRequestFilter }) {
  return <form action="/admin/matching/avoidance-requests" method="get" onSubmit={(event) => { if (!confirmActivityReviewNavigation()) event.preventDefault() }} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
    <label className="min-w-40 flex-1 text-sm"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">处理状态</span><select name="status" defaultValue={status} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><option value="pending">{PEER_NO_MATCH_STATUS_LABELS.pending}</option><option value="resolved">{PEER_NO_MATCH_STATUS_LABELS.resolved}</option><option value="closed">{PEER_NO_MATCH_STATUS_LABELS.closed}</option><option value="all">全部申请</option></select></label>
    <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">查看</button>
    <Link href="/admin/matching/avoidance-requests" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">重置</Link>
  </form>
}
