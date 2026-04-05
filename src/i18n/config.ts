export const locales = ["zh", "ja"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "zh"
