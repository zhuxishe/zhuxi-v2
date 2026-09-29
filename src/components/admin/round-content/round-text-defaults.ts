import type { RoundContentDraft, RoundPurpose, RoundText } from "@/types"
import zh from "@/messages/zh.json"
import ja from "@/messages/ja.json"
import { localizeRoundText } from "@/lib/matching/round-config"
import { roundCardCopy } from "@/lib/matching/round-display"

export function roundCopyDefaults(draft: Pick<RoundContentDraft, "roundName" | "purpose" | "contentConfig">, locale: "zh" | "ja") {
  const messages = locale === "ja" ? ja : zh
  const { purpose, contentConfig: config } = draft
  const empty = { zh: "", ja: "" }
  const defaults = purpose === "matching" ? messages.playerHome.action.survey : {
    title: messages.rounds.purpose[purpose], description: messages.rounds.description[purpose], cta: messages.rounds.cta[purpose],
  }
  const copy = roundCardCopy({
    id: "", round_name: draft.roundName, purpose, status: "draft", survey_start: "", survey_end: "", activity_start: "", activity_end: "",
    content_config: { ...config, cardTitle: empty, cardDescription: empty, cardCta: empty },
  }, locale, defaults)
  const introduction = localizeRoundText(config.introduction, locale)
  const introductionSource = config.introduction[locale].trim() ? "沿用活动介绍" : `沿用${locale === "ja" ? "中文" : "日文"}活动介绍`
  return {
    cardTitle: { text: copy.title, source: purpose === "matching" ? "系统默认" : locale === "ja" && config.titleJa.trim() ? "沿用日文名称" : "沿用轮次名称" },
    cardDescription: { text: copy.description, source: introduction ? introductionSource : "系统默认" },
    cardCta: { text: copy.cta, source: "系统默认" },
  }
}

export function roundLabelDefaults(purpose: RoundPurpose, locale: "zh" | "ja") {
  const survey = (locale === "ja" ? ja : zh).survey
  return {
    gameType: survey.gameType.title, genderPref: survey.gender.title, availability: survey.timeSlots.title,
    interestTags: survey.interestTags, socialStyle: survey.socialStyle.title, message: survey.message.title,
    submit: purpose === "registration" ? survey.registration.submit : survey.submit,
  }
}

export function resolveRoundEditorText(value: RoundText, locale: "zh" | "ja", fallbackText = "", fallbackSource = "系统默认", inheritOtherLocale = true) {
  if (value[locale].trim()) return { text: value[locale], source: "已自定义" }
  const otherLocale = locale === "ja" ? "zh" : "ja"
  if (inheritOtherLocale && value[otherLocale].trim()) return { text: value[otherLocale].trim(), source: `沿用${otherLocale === "zh" ? "中文" : "日文"}` }
  return { text: fallbackText, source: fallbackText ? fallbackSource : "" }
}
