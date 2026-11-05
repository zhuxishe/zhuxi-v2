"use client"

import { useRouter } from "next/navigation"
import type { AdminActivityReviewsData } from "@/lib/activity-reviews/types"
import type { AdminReviewRequirementsResult } from "@/lib/activity-reviews/requirements"
import { ActivityReviewsDashboard, type AdminActivityReviewActions } from "./ActivityReviewsDashboard"

export function AdminActivityReviewsClient({ data, actions, requirements }: { data: AdminActivityReviewsData; actions: AdminActivityReviewActions; requirements?: AdminReviewRequirementsResult }) {
  const router = useRouter()
  return <ActivityReviewsDashboard key={data.context?.roundId ?? "empty"} data={data} actions={actions} requirements={requirements} onNavigate={(href) => router.push(href)} onSaved={() => router.refresh()} />
}
