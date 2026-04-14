const DEFAULT_SITE_URL = "https://zhuxishe.jp"

function normalizeSiteUrl(value?: string | null) {
  if (!value) return DEFAULT_SITE_URL
  return value.replace(/\/$/, "")
}

export function getPublicSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
}

export function buildPublicUrl(path: string) {
  return `${getPublicSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`
}
