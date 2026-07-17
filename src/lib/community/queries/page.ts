import { COMMUNITY_PAGE_SIZE } from "@/lib/community/constants"
import { fetchPublishedAnnouncements, fetchPublishedFaqs } from "./official"
import { fetchCommunityPosts } from "./posts"
import type { CommunityLocale, CommunityPageData, CommunityTab, CommunityTreeholeSort } from "@/lib/community/types"

export async function fetchCommunityPageData(options: {
  memberId: string
  locale: CommunityLocale
  tab: CommunityTab
  page: number
  sort: CommunityTreeholeSort
}): Promise<CommunityPageData> {
  if (options.tab === "all") {
    const [announcements, treeholes, photos, faqs] = await Promise.all([
      fetchPublishedAnnouncements(options.locale, { limit: 3, pinnedOnly: true }),
      fetchCommunityPosts({ memberId: options.memberId, postType: "treehole", limit: 3 }),
      fetchCommunityPosts({ memberId: options.memberId, postType: "photo", limit: 2 }),
      fetchPublishedFaqs(options.locale, { limit: 2, featuredOnly: true }),
    ])
    return { announcements, treeholes, photos, faqs, hasMore: false }
  }

  const limit = Math.max(1, options.page) * COMMUNITY_PAGE_SIZE
  if (options.tab === "announcements") {
    const announcements = await fetchPublishedAnnouncements(options.locale, { limit: limit + 1 })
    return { announcements: announcements.slice(0, limit), treeholes: [], photos: [], faqs: [], hasMore: announcements.length > limit }
  }
  if (options.tab === "qa") {
    const faqs = await fetchPublishedFaqs(options.locale, { limit: limit + 1 })
    return { announcements: [], treeholes: [], photos: [], faqs: faqs.slice(0, limit), hasMore: faqs.length > limit }
  }
  if (options.tab === "treehole") {
    const treeholes = await fetchCommunityPosts({ memberId: options.memberId, postType: "treehole", limit: limit + 1, sort: options.sort })
    return { announcements: [], treeholes: treeholes.slice(0, limit), photos: [], faqs: [], hasMore: treeholes.length > limit }
  }

  const photos = await fetchCommunityPosts({ memberId: options.memberId, postType: "photo", limit: limit + 1 })
  return { announcements: [], treeholes: [], photos: photos.slice(0, limit), faqs: [], hasMore: photos.length > limit }
}
