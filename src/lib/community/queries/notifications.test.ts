import { describe, expect, it } from "vitest"
import {
  COMMUNITY_SECURITY_NOTIFICATION_TYPES,
  resolveCommunityNotificationTarget,
} from "./notifications"

const publishedPosts = new Map([
  ["treehole-post", { id: "treehole-post", post_type: "treehole", status: "published" }],
  ["photo-post", { id: "photo-post", post_type: "photo", status: "published" }],
])
const publishedComments = new Map([
  ["comment-id", { id: "comment-id", status: "published" }],
])
const activeAnnouncements = new Map([
  ["announcement-id", {
    id: "announcement-id",
    status: "published",
    display_start_at: "2000-01-01T00:00:00.000Z",
    display_end_at: "2100-01-01T00:00:00.000Z",
  }],
])

function target(overrides: Partial<{
  postId: string | null
  commentId: string | null
  reportId: string | null
  announcementId: string | null
}> = {}) {
  return {
    postId: null,
    commentId: null,
    reportId: null,
    announcementId: null,
    ...overrides,
  }
}

describe("community notification visibility after a permanent ban", () => {
  it("keeps only safety, report, sanction, and content-moderation notifications", () => {
    expect(COMMUNITY_SECURITY_NOTIFICATION_TYPES).toEqual([
      "report_resolved",
      "content_hidden",
      "content_deleted",
      "warning",
      "mute",
      "permanent_ban",
    ])
    expect(COMMUNITY_SECURITY_NOTIFICATION_TYPES).not.toContain("like")
    expect(COMMUNITY_SECURITY_NOTIFICATION_TYPES).not.toContain("comment")
    expect(COMMUNITY_SECURITY_NOTIFICATION_TYPES).not.toContain("reply")
    expect(COMMUNITY_SECURITY_NOTIFICATION_TYPES).not.toContain("announcement")
  })
})

describe("community notification targets", () => {
  it("deep-links comment notifications to the post and comment anchor", () => {
    expect(resolveCommunityNotificationTarget(
      target({ postId: "treehole-post", commentId: "comment-id" }),
      publishedPosts,
      publishedComments,
      activeAnnouncements,
    )).toEqual({
      href: "/app/community/treehole/treehole-post?comment=comment-id#comment-comment-id",
      unavailable: false,
    })
  })

  it("deep-links active announcements and reports", () => {
    expect(resolveCommunityNotificationTarget(
      target({ announcementId: "announcement-id" }),
      publishedPosts,
      publishedComments,
      activeAnnouncements,
    )).toEqual({
      href: "/app/community?tab=announcements&announcement=announcement-id",
      unavailable: false,
    })
    expect(resolveCommunityNotificationTarget(
      target({ reportId: "report-id" }),
      publishedPosts,
      publishedComments,
      activeAnnouncements,
    )).toEqual({
      href: "/app/profile/community#community-reports",
      unavailable: false,
    })
  })

  it("marks only missing or inactive related content as unavailable", () => {
    expect(resolveCommunityNotificationTarget(
      target({ postId: "missing-post" }),
      publishedPosts,
      publishedComments,
      activeAnnouncements,
    )).toEqual({ href: null, unavailable: true })
    expect(resolveCommunityNotificationTarget(
      target({ commentId: "comment-id" }),
      publishedPosts,
      publishedComments,
      activeAnnouncements,
    )).toEqual({ href: null, unavailable: true })
    expect(resolveCommunityNotificationTarget(
      target({ announcementId: "inactive-announcement" }),
      publishedPosts,
      publishedComments,
      new Map([["inactive-announcement", {
        id: "inactive-announcement",
        status: "offline",
        display_start_at: null,
        display_end_at: null,
      }]]),
    )).toEqual({ href: null, unavailable: true })
    expect(resolveCommunityNotificationTarget(
      target(),
      publishedPosts,
      publishedComments,
      activeAnnouncements,
    )).toEqual({ href: null, unavailable: false })
  })
})
