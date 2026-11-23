export const LARGE_ACTIVITY_COVER_ASPECT_RATIOS = ["3:4", "2:3", "9:16", "1:1", "4:3", "16:9"] as const

export type LargeActivityCoverAspectRatio = typeof LARGE_ACTIVITY_COVER_ASPECT_RATIOS[number]

export const DEFAULT_LARGE_ACTIVITY_COVER_ASPECT_RATIO: LargeActivityCoverAspectRatio = "3:4"

export function isLargeActivityCoverAspectRatio(value: unknown): value is LargeActivityCoverAspectRatio {
  return LARGE_ACTIVITY_COVER_ASPECT_RATIOS.some((ratio) => ratio === value)
}

export function resolveLargeActivityCoverAspectRatio(value: unknown): LargeActivityCoverAspectRatio {
  return isLargeActivityCoverAspectRatio(value) ? value : DEFAULT_LARGE_ACTIVITY_COVER_ASPECT_RATIO
}

export function isMissingLargeActivityCoverAspectRatioColumn(error: { code?: string; message?: string }) {
  return (error.code === "42703" || error.code === "PGRST204")
    && Boolean(error.message?.includes("cover_aspect_ratio"))
}
