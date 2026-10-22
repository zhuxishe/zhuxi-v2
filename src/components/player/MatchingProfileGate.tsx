"use client"

import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { MatchingProfileDialog } from "./MatchingProfileDialog"
import { matchingProfileCopy, type MatchingProfileKind } from "@/lib/matching/profile-readiness"
import { buildMatchingCompletionHref } from "@/lib/matching/completion-flow"

/** Direct URLs have the same gate, and never receive the editable survey beneath it. */
export function MatchingProfileGate({ roundId, fromParticipation, backHref, missing, failed = false }: {
  roundId: string; fromParticipation: boolean; backHref: string; missing: MatchingProfileKind[]; failed?: boolean
}) {
  const router = useRouter()
  const copy = matchingProfileCopy(useLocale())
  return <div className="py-12 text-center text-muted-foreground">
    <p>{failed ? copy.failed : copy.title}</p>
    <MatchingProfileDialog open missing={missing} failed={failed}
      onCancel={() => router.replace(backHref)} onRetry={() => router.refresh()}
      onComplete={() => router.replace(buildMatchingCompletionHref({ roundId, fromParticipation }))} />
  </div>
}
