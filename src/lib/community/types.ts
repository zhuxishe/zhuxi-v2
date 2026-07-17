export type CommunityTab = "all" | "announcements" | "treehole" | "album" | "qa"
export type CommunityPostType = "treehole" | "photo"
export type CommunityContentStatus = "published" | "hidden" | "deleted"
export type OfficialContentStatus = "draft" | "published" | "offline"
export type CommunityLocale = "zh" | "ja"

export interface CommunityProfile {
  id: string
  nickname: string
  avatarKind: "default" | "preset" | "upload" | "personal"
  avatarPath: string | null
  presetAvatar: string | null
  joinedAt: string
}

export interface CommunityPostImage {
  id: string
  storagePath: string
  thumbnailPath: string
  sortOrder: number
  width: number | null
  height: number | null
  byteSize: number | null
  mimeType: string
}

export interface CommunityComment {
  id: string
  postId: string
  parentCommentId: string | null
  author: CommunityProfile | null
  isAnonymousAuthor: boolean
  body: string | null
  status: CommunityContentStatus
  removalSource?: "author" | "admin" | null
  editedAt: string | null
  createdAt: string
  isMine?: boolean
  replies?: CommunityComment[]
}

export interface CommunityPost {
  id: string
  postType: CommunityPostType
  author: CommunityProfile | null
  title: string | null
  body: string | null
  isAnonymous: boolean
  status: CommunityContentStatus
  likeCount: number
  commentCount: number
  publishedAt: string
  editedAt: string | null
  images: CommunityPostImage[]
  commentsPreview: CommunityComment[]
  likedByMe: boolean
  isMine: boolean
  isReported: boolean
}

export interface LocalizedAnnouncement {
  id: string
  title: string
  summary: string
  body: string
  publisherName: string
  publishedAt: string | null
  isPinned: boolean
  linkUrl: string | null
  linkText: string | null
  fallbackLocale: CommunityLocale | null
}

export interface LocalizedFaq {
  id: string
  question: string
  answer: string
  isFeatured: boolean
  fallbackLocale: CommunityLocale | null
}

export interface CommunityNotification {
  id: string
  type: string
  title: string
  body: string
  href: string | null
  unavailable: boolean
  actor: CommunityProfile | null
  groupCount: number
  readAt: string | null
  createdAt: string
}

export interface CommunityRestriction {
  type: "warning" | "mute" | "permanent_ban"
  reason: string
  startsAt: string
  endsAt: string | null
}

export interface CommunityContext {
  memberId: string
  profile: CommunityProfile | null
  restriction: CommunityRestriction | null
  canWrite: boolean
}

export interface CommunityPageData {
  announcements: LocalizedAnnouncement[]
  faqs: LocalizedFaq[]
  treeholes: CommunityPost[]
  photos: CommunityPost[]
  hasMore: boolean
}

export interface CommunityActionState {
  success?: boolean
  error?: string
  fieldErrors?: Record<string, string>
}

export interface UploadedCommunityImage {
  storagePath: string
  thumbnailPath: string
  width: number
  height: number
  byteSize: number
  mimeType: "image/jpeg" | "image/png" | "image/webp"
  previewUrl?: string
}
