"use client"

import Link from "next/link"
import { Pencil } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { RoundRecord } from "@/types/matching-round"
import { getRoundPurpose } from "@/lib/matching/round-config"
import { canCancelRegistration, canEditParticipation, canReregisterParticipation, participationEditHref, participationStatus } from "@/lib/matching/participation-display"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { CancelRegistrationButton } from "../CancelRegistrationButton"
import { useSurveyWindow } from "@/lib/matching/use-survey-window"

export function ParticipationRecordActions({ round, initialNow, cancelledAt, updatedAt }: {
  round: RoundRecord; initialNow: string; cancelledAt?: string | null; updatedAt: string | null
}) {
  const t = useTranslations("participation")
  const locale = useLocale()
  const state = useSurveyWindow(round, initialNow)
  const editable = canEditParticipation(round, state, cancelledAt)
  const cancellable = canCancelRegistration(round, state, cancelledAt)
  const rejoin = canReregisterParticipation(round, state, cancelledAt)
  const registration = getRoundPurpose(round.purpose) === "registration"
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
    <p className="text-sm font-semibold text-primary" role="status">{t(`status.${participationStatus(round, state, cancelledAt)}`)}</p>
    <p className="text-xs leading-5 text-muted-foreground">{cancelledAt ? t("reregisterHint") : editable ? t("editableUntil", { time: formatSurveyTime(round.survey_end, locale) }) : t(cancellable ? "registrationConfirmed" : state === "scheduled" ? "notOpenHint" : "readOnlyHint")}</p>
    {getRoundPurpose(round.purpose) === "matching" && <p className="text-xs leading-5 text-muted-foreground">{t("matchingHint")}</p>}
    {(editable || rejoin) && <Link href={participationEditHref(round.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <Pencil className="size-3.5" aria-hidden="true" />{t(rejoin ? "reregister" : registration ? "editRegistration" : "editSurvey")}
    </Link>}
    {cancellable && <CancelRegistrationButton roundId={round.id} roundName={round.round_name} expectedUpdatedAt={updatedAt} />}
    {registration && !cancelledAt && !cancellable && <p className="text-xs leading-5 text-muted-foreground">{t("cancelUnavailableHint")}</p>}
  </section>
}
