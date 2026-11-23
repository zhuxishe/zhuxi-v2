import type { ActivityReviewSystem, ActivityReviewPolicyVersion } from "@/lib/activity-reviews/types"

export function activityReviewVersionLabel(reviewSystem?: ActivityReviewSystem, policyVersion?: ActivityReviewPolicyVersion): string {
  if (policyVersion === "unified_v2") return "新版统一互评"
  if (policyVersion === "unified_v1" || (!policyVersion && reviewSystem === "unified")) return "既有单项互评"
  return "旧版评价"
}

export function ActivityReviewVersion({ reviewSystem, policyVersion }: { reviewSystem?: ActivityReviewSystem; policyVersion?: ActivityReviewPolicyVersion }) {
  const newest = policyVersion === "unified_v2"
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${newest ? "border-primary/20 bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>{activityReviewVersionLabel(reviewSystem, policyVersion)}</span>
}
