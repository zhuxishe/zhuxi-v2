import { describe, expect, it } from "vitest"
import { localizeAnnouncement, localizeFaq } from "./localize"
import { COMMUNITY_MAX_IMAGE_BYTES } from "./constants"
import { validateComment, validateNickname, validatePhotoPost, validateTreehole } from "./validation"

describe("community validation", () => {
  it("validates nickname boundaries and reserved names", () => {
    expect(validateNickname("竹")).toMatch(/2/)
    expect(validateNickname("竹溪会员")).toBeNull()
    expect(validateNickname("管理员")).not.toBeNull()
    expect(validateNickname("ａｄｍｉｎ")).not.toBeNull()
    expect(validateNickname("a".repeat(21))).toMatch(/20/)
  })

  it("requires treehole content and limits comments", () => {
    expect(validateTreehole("", "")).toMatchObject({ fieldErrors: { body: expect.any(String) } })
    expect(validateTreehole("标题", "内容")).toBeNull()
    expect(validateComment(" ")).not.toBeNull()
    expect(validateComment("a".repeat(500))).toBeNull()
    expect(validateComment("a".repeat(501))).not.toBeNull()
  })

  it("requires one to nine processed photo records", () => {
    const image = {
      storagePath: "user/photos/a.webp",
      thumbnailPath: "user/photos/a-thumb.webp",
      width: 800,
      height: 600,
      byteSize: 1000,
      mimeType: "image/webp" as const,
    }
    expect(validatePhotoPost("", [])).not.toBeNull()
    expect(validatePhotoPost("", [image])).toBeNull()
    expect(validatePhotoPost("", Array.from({ length: 10 }, () => image))).not.toBeNull()
    expect(validatePhotoPost("", [{ ...image, byteSize: COMMUNITY_MAX_IMAGE_BYTES }])).toBeNull()
    expect(validatePhotoPost("", [{ ...image, byteSize: COMMUNITY_MAX_IMAGE_BYTES + 1 }])).toContain("4MB")
  })
})

describe("community localization", () => {
  const announcement = {
    id: "announcement",
    title_zh: "中文标题",
    summary_zh: "中文摘要",
    body_zh: "中文正文",
    title_ja: "日本語タイトル",
    summary_ja: null,
    body_ja: "日本語本文",
    publisher_name: "竹溪社",
    published_at: "2026-07-17T00:00:00.000Z",
    is_pinned: true,
    link_url: null,
    link_text_zh: null,
    link_text_ja: null,
  }

  it("falls back as a whole announcement instead of mixing languages", () => {
    const localized = localizeAnnouncement(announcement, "ja")
    expect(localized).toMatchObject({
      title: "中文标题",
      summary: "中文摘要",
      body: "中文正文",
      fallbackLocale: "zh",
    })
  })

  it("omits FAQ when neither language is complete", () => {
    expect(localizeFaq({
      id: "faq",
      question_zh: "问题",
      answer_zh: null,
      question_ja: null,
      answer_ja: "回答",
      is_featured: false,
    }, "zh")).toBeNull()
  })
})
