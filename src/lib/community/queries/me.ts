import { createAdminClient } from "@/lib/supabase/admin"
import { fetchCommunityPostsByIds } from "./posts"
import type { CommunityPost, CommunityProfile } from "@/lib/community/types"

export interface CommunityNotificationPreferences {
  likesEnabled: boolean
  commentsEnabled: boolean
  repliesEnabled: boolean
  announcementsEnabled: boolean
}

export interface CommunitySelfData {
  posts: CommunityPost[]
  comments: Array<{ id: string; postId: string; postType: "treehole" | "photo"; body: string | null; status: string; createdAt: string }>
  likedPosts: CommunityPost[]
  reports: Array<{ id: string; targetType: string; reason: string; status: string; createdAt: string }>
  hiddenPosts: CommunityPost[]
  blockedProfiles: CommunityProfile[]
  preferences: CommunityNotificationPreferences
}

export async function fetchCommunitySelfData(memberId: string): Promise<CommunitySelfData> {
  const db = createAdminClient()
  const [authors, commentAuthors, likes, reports, hidden, blocks, preferences] = await Promise.all([
    db.schema("private").from("community_post_authors").select("post_id").eq("member_id", memberId),
    db.schema("private").from("community_comment_authors").select("comment_id").eq("member_id", memberId),
    db.from("community_likes").select("post_id").eq("member_id", memberId).order("created_at", { ascending: false }),
    db.from("community_reports").select("id, target_type, reason, status, created_at").eq("reporter_member_id", memberId).order("created_at", { ascending: false }).limit(20),
    db.from("community_user_hides").select("post_id").eq("member_id", memberId).order("created_at", { ascending: false }),
    db.from("community_blocks").select("blocked_profile_id").eq("blocker_member_id", memberId).order("created_at", { ascending: false }),
    db.from("community_notification_preferences").select("likes_enabled, comments_enabled, replies_enabled, announcements_enabled").eq("member_id", memberId).maybeSingle<{
      likes_enabled: boolean
      comments_enabled: boolean
      replies_enabled: boolean
      announcements_enabled: boolean
    }>(),
  ])

  const ownPostIds = (authors.data ?? []).map((row: { post_id: string }) => row.post_id)
  const likedPostIds = (likes.data ?? []).map((row: { post_id: string }) => row.post_id)
  const hiddenPostIds = (hidden.data ?? []).map((row: { post_id: string }) => row.post_id)
  const commentIds = (commentAuthors.data ?? []).map((row: { comment_id: string }) => row.comment_id)
  const blockedProfileIds = (blocks.data ?? []).map((row: { blocked_profile_id: string }) => row.blocked_profile_id)

  const [posts, likedPosts, hiddenPosts, commentsResult, profilesResult] = await Promise.all([
    fetchCommunityPostsByIds(ownPostIds, memberId, false),
    fetchCommunityPostsByIds(likedPostIds, memberId),
    fetchCommunityPostsByIds(hiddenPostIds, memberId, false),
    commentIds.length
      ? db.from("community_comments").select("id, post_id, body, status, created_at").in("id", commentIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    blockedProfileIds.length
      ? db.from("community_profiles").select("id, nickname, avatar_kind, avatar_path, preset_avatar, joined_at").in("id", blockedProfileIds)
      : Promise.resolve({ data: [] }),
  ])

  const commentRows = (commentsResult.data ?? []) as Array<{ id: string; post_id: string; body: string | null; status: string; created_at: string }>
  const commentPostIds = [...new Set(commentRows.map((row) => row.post_id))]
  const commentPosts = commentPostIds.length
    ? await db.from("community_posts").select("id, post_type, status").in("id", commentPostIds).eq("status", "published")
    : { data: [] }
  const postTypes = new Map(
    (commentPosts.data ?? []).map((row: { id: string; post_type: "treehole" | "photo" }) => [row.id, row.post_type]),
  )

  return {
    posts,
    comments: commentRows.filter((row) => postTypes.has(row.post_id)).map((row) => ({
      id: row.id,
      postId: row.post_id,
      postType: postTypes.get(row.post_id) ?? "treehole",
      body: row.body,
      status: row.status,
      createdAt: row.created_at,
    })),
    likedPosts,
    reports: (reports.data ?? []).map((row: { id: string; target_type: string; reason: string; status: string; created_at: string }) => ({
      id: row.id,
      targetType: row.target_type,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    })),
    hiddenPosts,
    blockedProfiles: (profilesResult.data ?? []).map((row: {
      id: string
      nickname: string
      avatar_kind: CommunityProfile["avatarKind"]
      avatar_path: string | null
      preset_avatar: string | null
      joined_at: string
    }) => ({
      id: row.id,
      nickname: row.nickname,
      avatarKind: row.avatar_kind,
      avatarPath: row.avatar_path,
      presetAvatar: row.preset_avatar,
      joinedAt: row.joined_at,
    })),
    preferences: preferences.data ? {
      likesEnabled: preferences.data.likes_enabled,
      commentsEnabled: preferences.data.comments_enabled,
      repliesEnabled: preferences.data.replies_enabled,
      announcementsEnabled: preferences.data.announcements_enabled,
    } : {
      likesEnabled: true,
      commentsEnabled: true,
      repliesEnabled: true,
      announcementsEnabled: true,
    },
  }
}
