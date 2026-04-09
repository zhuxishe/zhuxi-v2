"use client"

import { useLocale } from "next-intl"
import { localizeTag } from "@/lib/constants/tags-i18n"
import { localizeSupplementary } from "@/lib/constants/supplementary-i18n"

/** Build a value→label map for i18n display in MultiTagSelect/SingleSelect.
 *  Values stay Chinese (for DB), labels show localized text. */
export function useTagLabels(options: readonly string[]): Record<string, string> | undefined {
  const locale = useLocale()
  if (locale === "zh") return undefined // no mapping needed
  const map: Record<string, string> = {}
  for (const opt of options) {
    const fromTag = localizeTag(opt, locale)
    const localized = fromTag !== opt ? fromTag : localizeSupplementary(opt, locale)
    if (localized !== opt) map[opt] = localized
  }
  return Object.keys(map).length > 0 ? map : undefined
}
