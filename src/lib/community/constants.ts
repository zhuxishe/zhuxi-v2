import type { CommunityTab } from "./types"

export const COMMUNITY_TABS: readonly CommunityTab[] = [
  "all",
  "announcements",
  "treehole",
  "album",
  "qa",
]

export const COMMUNITY_PAGE_SIZE = 10
export const COMMUNITY_COMMENT_PAGE_SIZE = 20
export const COMMUNITY_NOTIFICATION_PAGE_SIZE = 20
export const COMMUNITY_MAX_IMAGES = 9
export const COMMUNITY_MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const COMMUNITY_MAX_MULTIPART_BYTES = COMMUNITY_MAX_IMAGE_BYTES + 256 * 1024
export const COMMUNITY_MAX_IMAGE_PIXELS = 40_000_000
export const COMMUNITY_MEDIA_BUCKET = "community-media"
export const COMMUNITY_AVATAR_BUCKET = "community-avatars"

export const COMMUNITY_PRESET_AVATARS = ["bamboo", "stream", "leaf"] as const

export function isCommunityTab(value: string | undefined): value is CommunityTab {
  return !!value && COMMUNITY_TABS.includes(value as CommunityTab)
}
