"use client"

import { useLocale, useTranslations } from "next-intl"
import type { PlayerParticipationDetail } from "@/types/player-participation"
import { getRoundPurpose, localizeRoundText, normalizeRoundConfig } from "@/lib/matching/round-config"
import { participationAvailability, participationCustomAnswers } from "@/lib/matching/participation-display"
import { localizeTag } from "@/lib/constants/tags-i18n"

export function ParticipationAnswers({ record }: { record: PlayerParticipationDetail }) {
  const t = useTranslations("participation")
  const survey = useTranslations("survey")
  const time = useTranslations("timeGrid")
  const locale = useLocale()
  const config = normalizeRoundConfig(record.round.content_config)
  const custom = participationCustomAnswers(config, record.custom_answers, locale)
  const matching = getRoundPurpose(record.round.purpose) === "matching"
  const availability = participationAvailability(record.availability)
  const slotKeys: Record<string, "morning" | "afternoon" | "evening"> = { 上午: "morning", 下午: "afternoon", 晚上: "evening" }
  const socialKeys: Record<string, string> = { 慢热: "slowWarm", 活跃: "active", 善于倾听: "listener", 话题广: "wideTopics", 温和: "gentle", 喜欢竞技: "competitive" }
  const gameKeys: Record<string, string> = { 双人: "duo", 多人: "multi", 都可以: "either" }
  const genderKeys: Record<string, string> = { 男: "male", 女: "female", 都可以: "either" }
  const rows = matching ? [
    { id: "game", label: localizeRoundText(config.labels.gameType, locale, survey("gameType.title")), value: gameKeys[record.game_type_pref] ? survey(`gameType.${gameKeys[record.game_type_pref]}.label`) : record.game_type_pref },
    { id: "gender", label: localizeRoundText(config.labels.genderPref, locale, survey("gender.title")), value: genderKeys[record.gender_pref] ? survey(`gender.${genderKeys[record.gender_pref]}`) : record.gender_pref },
    { id: "availability", label: localizeRoundText(config.labels.availability, locale, survey("timeSlots.title")), value: availability.map(({ date, slots }) => `${date} · ${slots.map((slot) => time(slotKeys[slot])).join("、")}`).join("\n") },
    ...(config.modules.interests || record.interest_tags?.length ? [{ id: "interests", label: localizeRoundText(config.labels.interestTags, locale, survey("interestTags")), value: (record.interest_tags ?? []).map((tag) => localizeTag(tag, locale)).join("、") }] : []),
    ...(config.modules.social || record.social_style ? [{ id: "social", label: localizeRoundText(config.labels.socialStyle, locale, survey("socialStyle.title")), value: record.social_style && socialKeys[record.social_style] ? survey(`socialStyle.${socialKeys[record.social_style]}`) : record.social_style }] : []),
    ...(config.modules.message || record.message ? [{ id: "message", label: localizeRoundText(config.labels.message, locale, survey("message.title")), value: record.message }] : []),
  ] : []

  return <section className="rounded-2xl border border-border bg-card p-4">
    <h2 className="text-base font-semibold">{t("answersTitle")}</h2>
    <dl className="mt-4 space-y-5">
      {rows.map((row) => <div key={row.id}><dt className="text-xs font-medium text-muted-foreground">{row.label}</dt><dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{row.value || t("notAnswered")}</dd></div>)}
      {custom.map((row, index) => <div key={row.id}>
        <dt className="text-xs font-medium text-muted-foreground">{row.label || t("earlierQuestion", { number: index + 1 })}</dt>
        <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">
          {row.values.length > 0 ? row.values.join("、") : !row.unavailable ? t("notAnswered") : null}
          {row.unavailable && <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("changedQuestion")}</p>}
        </dd>
      </div>)}
    </dl>
    {!matching && custom.length === 0 && <p className="mt-3 text-sm leading-6 text-muted-foreground">{t(record.cancelled_at ? "registrationCancelledAnswers" : "registrationConfirmed")}</p>}
  </section>
}
