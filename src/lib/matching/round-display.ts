import type { RoundRecord } from "@/types/matching-round"
import { getRoundPurpose, localizeRoundText, normalizeRoundConfig } from "./round-config"

export function roundHref(id: string) {
  return `/app/matching/survey?round=${encodeURIComponent(id)}`
}

export function roundDisplayName(round: RoundRecord, locale: string) {
  return locale === "ja" ? normalizeRoundConfig(round.content_config).titleJa.trim() || round.round_name : round.round_name
}

export function roundCardCopy(round: RoundRecord, locale: string, defaults: { title: string; description: string; cta: string }) {
  const config = normalizeRoundConfig(round.content_config)
  return {
    title: localizeRoundText(config.cardTitle, locale, getRoundPurpose(round.purpose) === "matching" ? defaults.title : roundDisplayName(round, locale)),
    description: localizeRoundText(config.cardDescription, locale, localizeRoundText(config.introduction, locale, defaults.description)),
    cta: localizeRoundText(config.cardCta, locale, defaults.cta),
  }
}

/** Pending participation comes first, then notices, then already-submitted entries. */
export function selectHomeRound(rounds: RoundRecord[], submittedIds: string[]) {
  const submitted = new Set(submittedIds)
  const priority = (round: RoundRecord) => getRoundPurpose(round.purpose) === "announcement" ? 1 : submitted.has(round.id) ? 2 : 0
  return [...rounds].sort((a, b) => priority(a) - priority(b)
    || Date.parse(a.survey_end) - Date.parse(b.survey_end))[0] ?? null
}
