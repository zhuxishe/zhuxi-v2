export type CommunityContentStatus = "draft" | "published" | "offline"

export type CommunityUserContentStatus = "published" | "hidden" | "deleted"
export type CommunityUserContentType = "treehole" | "photo" | "comment" | "reply"

export type CommunityReportStatus = "pending" | "resolved" | "dismissed"

export type CommunityTargetType = "post" | "comment" | "profile"

export type CommunityReportReason =
  | "harassment"
  | "privacy"
  | "spam"
  | "inappropriate"
  | "other"

export interface CommunityAnnouncement {
  id: string
  title_zh: string | null
  summary_zh: string | null
  body_zh: string | null
  title_ja: string | null
  summary_ja: string | null
  body_ja: string | null
  publisher_name: string
  status: CommunityContentStatus
  is_pinned: boolean
  display_start_at: string | null
  display_end_at: string | null
  published_at: string | null
  link_url: string | null
  link_text_zh: string | null
  link_text_ja: string | null
  notify_on_publish: boolean
  notified_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CommunityAnnouncementInput {
  title_zh?: string
  summary_zh?: string
  body_zh?: string
  title_ja?: string
  summary_ja?: string
  body_ja?: string
  publisher_name: string
  status: CommunityContentStatus
  is_pinned: boolean
  display_start_at?: string
  display_end_at?: string
  link_url?: string
  link_text_zh?: string
  link_text_ja?: string
  notify_on_publish: boolean
  sort_order: number
}

export interface CommunityFaq {
  id: string
  question_zh: string | null
  answer_zh: string | null
  question_ja: string | null
  answer_ja: string | null
  status: CommunityContentStatus
  is_featured: boolean
  sort_order: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface CommunityFaqInput {
  question_zh?: string
  answer_zh?: string
  question_ja?: string
  answer_ja?: string
  status: CommunityContentStatus
  is_featured: boolean
  sort_order: number
}

export interface CommunityOverviewMetrics {
  pendingReports: number
  todayTreeholes: number
  todayPhotos: number
  hiddenContent: number
  activeMutes: number
}

export interface CommunityReport {
  id: string
  reporter_member_id: string
  target_type: CommunityTargetType
  reported_post_id: string | null
  reported_comment_id: string | null
  reported_profile_id: string | null
  reason: CommunityReportReason
  details: string | null
  status: CommunityReportStatus
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
  reporter_number: string | null
  target_title: string
  target_excerpt: string | null
  target_status: string | null
  target_snapshot_status: string | null
  target_snapshot_captured_at: string | null
  target_uses_snapshot: boolean
  target_is_anonymous: boolean
  target_report_count: number
  target_images: Array<{
    id: string
    storage_path: string
    thumbnail_path: string
    sort_order: number
  }>
  target_profile: {
    id: string
    nickname: string
    avatarKind: "default" | "preset" | "upload" | "personal"
    avatarPath: string | null
    presetAvatar: string | null
    joinedAt: string
  } | null
}

export interface CommunityModerationAction {
  id: string
  action_type: string
  internal_note: string | null
  admin_user_id: string | null
  created_at: string
}

export interface CommunityReportDetail extends CommunityReport {
  actions: CommunityModerationAction[]
}

export interface CommunityRevealedAuthor {
  member_id: string
  profile_id: string | null
  nickname: string | null
  member_number: string | null
  sanctions: Array<{
    id: string
    sanction_type: "warning" | "mute" | "permanent_ban"
    reason: string
    starts_at: string
    ends_at: string | null
    revoked_at: string | null
  }>
}

export interface CommunityAdminMember {
  profile_id: string
  nickname: string
  avatar_kind: "default" | "preset" | "upload" | "personal"
  avatar_path: string | null
  preset_avatar: string | null
  joined_at: string
  member_id: string | null
  member_number: string | null
  member_status: string
  active_sanction_type: "warning" | "mute" | "permanent_ban" | null
  active_sanction_ends_at: string | null
}

export interface CommunitySanction {
  id: string
  member_id: string
  sanction_type: "warning" | "mute" | "permanent_ban"
  reason: string
  starts_at: string
  ends_at: string | null
  revoked_at: string | null
  revoke_reason: string | null
  created_at: string
  is_active: boolean
}

export interface CommunityMemberDetail extends CommunityAdminMember {
  nickname_history: Array<{
    id: number
    old_nickname: string
    new_nickname: string
    changed_at: string
  }>
  sanctions: CommunitySanction[]
  stats: {
    treeholes: number
    photo_posts: number
    comments: number
    pending_reports: number
  }
}

export interface CommunityAdminContentRow {
  id: string
  targetType: "post" | "comment"
  contentType: CommunityUserContentType
  postId: string
  parentCommentId: string | null
  status: CommunityUserContentStatus
  isAnonymous: boolean
  authorProfileId: string | null
  authorNickname: string | null
  title: string | null
  body: string | null
  parentPostType: "treehole" | "photo"
  parentPostTitle: string | null
  imageCount: number
  images: Array<{
    id: string
    storagePath: string
    thumbnailPath: string
    sortOrder: number
  }>
  likeCount: number | null
  commentCount: number | null
  pendingReportCount: number
  totalReportCount: number
  occurredAt: string
  editedAt: string | null
  sourceRank: number
}

export interface CommunityAdminContentFilters {
  type?: CommunityUserContentType
  status?: CommunityUserContentStatus
  reports?: "pending" | "any" | "none"
  anonymous?: boolean
  query?: string
  from?: string
  to?: string
  cursor?: string
}

export type CommunityAdminReasonCode =
  | "privacy"
  | "harassment"
  | "spam"
  | "inappropriate"
  | "other"
  | "reviewed_restore"
