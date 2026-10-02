"use client"

import { useRouter } from "next/navigation"
import type { AdminActivityReviewsData } from "@/lib/activity-reviews/types"
import { ActivityReviewsDashboard, type AdminActivityReviewActions } from "./ActivityReviewsDashboard"

export function AdminActivityReviewsClient({ data, actions }: { data: AdminActivityReviewsData; actions: AdminActivityReviewActions }) {
  const router = useRouter()
  return <ActivityReviewsDashboard key={data.context?.roundId ?? "empty"} data={data} actions={actions} onNavigate={(href) => router.push(href)} onSaved={() => router.refresh()} />
}
