"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { registrationReviewCopy } from "@/lib/registration-review-gate/copy"
import type { RegistrationReviewBlocker } from "@/lib/registration-review-gate/types"
import { RegistrationReviewDialog } from "./RegistrationReviewDialog"

/** Direct URLs do not render an editable questionnaire beneath the review gate. */
export function RegistrationReviewGate({ roundId, fromParticipation, backHref, blockers, failed = false }: {
  roundId: string; fromParticipation: boolean; backHref: string; blockers: RegistrationReviewBlocker[]; failed?: boolean
}) {
  const router = useRouter()
  const copy = registrationReviewCopy(useLocale())
  return <div className="px-4 py-12 text-center text-muted-foreground">
    <p role="status">{failed ? copy.failed : copy.title}</p>
    <Link href={backHref} className="mt-4 inline-flex min-h-11 items-center underline">{copy.back}</Link>
    <RegistrationReviewDialog open roundId={roundId} fromParticipation={fromParticipation} blockers={blockers} failed={failed}
      onCancel={() => router.replace(backHref)} onRetry={() => router.refresh()} />
  </div>
}
