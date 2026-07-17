import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { Camera, CircleHelp, MessageCircle, Plus } from "lucide-react"
import { AnnouncementList } from "@/components/community/AnnouncementList"
import { CommunityEmptyState } from "@/components/community/CommunityEmptyState"
import { CommunityHeader } from "@/components/community/CommunityHeader"
import { CommunityPostCard, type CommunityPostCardLabels } from "@/components/community/CommunityPostCard"
import { CommunityTabs } from "@/components/community/CommunityTabs"
import { FaqList } from "@/components/community/FaqList"
import { LoadMoreLink } from "@/components/community/LoadMoreLink"
import { SectionHeader } from "@/components/community/SectionHeader"
import { CommunityPostMenu } from "./_components/CommunityPostMenu"
import { PostCardActions } from "./_components/PostCardActions"
import { requireCommunityAccess } from "@/lib/auth/community"
import { isCommunityTab } from "@/lib/community/constants"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { fetchCommunityPageData } from "@/lib/community/queries/page"
import type { CommunityPost, CommunityTab } from "@/lib/community/types"

interface CommunityPageProps {
  searchParams: Promise<{ tab?: string; page?: string; sort?: string; announcement?: string }>
}

export default async function CommunityPage({ searchParams }: CommunityPageProps) {
  const [params, context, rawLocale, t] = await Promise.all([
    searchParams,
    requireCommunityAccess(),
    getLocale(),
    getTranslations("community"),
  ])
  const locale = normalizeCommunityLocale(rawLocale)
  const tab: CommunityTab = isCommunityTab(params.tab) ? params.tab : "all"
  const page = Math.max(1, Math.min(20, Number.parseInt(params.page ?? "1", 10) || 1))
  const sort = params.sort === "discussed" ? "discussed" : "latest"
  const data = await fetchCommunityPageData({ memberId: context.memberId, locale, tab, page, sort })
  const tabLabels: Record<CommunityTab, string> = {
    all: t("tabs.all"),
    announcements: t("tabs.announcements"),
    treehole: t("tabs.treehole"),
    album: t("tabs.album"),
    qa: t("tabs.qa"),
  }
  const postLabels: CommunityPostCardLabels = {
    anonymousMember: t("treehole.anonymousMember"),
    anonymous: locale === "ja" ? "匿名" : "匿名",
    anonymousAuthor: t("treehole.anonymousOwner"),
    edited: t("post.edited"),
    likes: t("post.like"),
    comments: t("post.comment"),
    viewAllComments: t("post.viewComments", { count: "{count}" }),
    deletedComment: t("post.deletedByAuthor"),
    hiddenComment: t("post.removedByAdmin"),
    image: locale === "ja" ? "写真" : "照片",
    openPost: locale === "ja" ? "投稿を開く" : "打开动态",
  }

  return (
    <div className="space-y-6 px-4 pb-7 pt-5">
      <CommunityHeader title={t("title")} description={t("subtitle")} />
      <CommunityTabs currentTab={tab} labels={tabLabels} ariaLabel={locale === "ja" ? "コミュニティの分類" : "社区分类"} />
      {context.restriction?.type === "mute" && (
        <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">{t("common.muted")}</p>
      )}

      {tab === "all" && (
        <div className="space-y-7">
          {data.announcements.length > 0 && (
            <CommunitySection title={t("sections.pinnedAnnouncements")} moreHref="/app/community?tab=announcements" moreLabel={t("sections.more")}>
              <AnnouncementList announcements={data.announcements} locale={locale} labels={announcementLabels(locale)} />
            </CommunitySection>
          )}
          {data.treeholes.length > 0 && (
            <CommunitySection title={t("sections.latestTreeholes")} moreHref="/app/community?tab=treehole" moreLabel={t("sections.more")}>
              <PostList posts={data.treeholes} context={context} locale={locale} labels={postLabels} />
            </CommunitySection>
          )}
          {data.photos.length > 0 && (
            <CommunitySection title={t("sections.latestPhotos")} moreHref="/app/community?tab=album" moreLabel={t("sections.more")}>
              <PostList posts={data.photos} context={context} locale={locale} labels={postLabels} />
            </CommunitySection>
          )}
          {data.faqs.length > 0 && (
            <CommunitySection title={t("sections.featuredFaqs")} moreHref="/app/community?tab=qa" moreLabel={t("sections.more")}>
              <FaqList faqs={data.faqs} labels={faqLabels(locale)} />
            </CommunitySection>
          )}
        </div>
      )}

      {tab === "announcements" && (
        <section>
          <CommunityHeader title={t("announcement.title")} className="mb-3" />
          {data.announcements.length ? (
            <AnnouncementList
              announcements={data.announcements}
              locale={locale}
              labels={announcementLabels(locale)}
              initiallyExpandedIds={params.announcement ? [params.announcement] : undefined}
            />
          ) : <CommunityEmptyState icon={MessageCircle} title={t("announcement.empty")} />}
        </section>
      )}

      {tab === "treehole" && (
        <section>
          <CommunityHeader
            title={t("treehole.title")}
            description={t("treehole.subtitle")}
            className="mb-3"
            action={context.canWrite ? <PrimaryLink href="/app/community/treehole/new" label={t("treehole.write")} compact /> : undefined}
          />
          <div className="mb-3 flex gap-2">
            <SortLink active={sort === "latest"} href="/app/community?tab=treehole&sort=latest" label={t("treehole.newest")} />
            <SortLink active={sort === "discussed"} href="/app/community?tab=treehole&sort=discussed" label={t("treehole.mostDiscussed")} />
          </div>
          {data.treeholes.length ? (
            <PostList posts={data.treeholes} context={context} locale={locale} labels={postLabels} />
          ) : <CommunityEmptyState icon={MessageCircle} title={t("treehole.empty")} action={context.canWrite ? <PrimaryLink href="/app/community/treehole/new" label={t("treehole.emptyAction")} /> : undefined} />}
        </section>
      )}

      {tab === "album" && (
        <section>
          <CommunityHeader title={t("photos.title")} className="mb-3" action={context.canWrite ? <PrimaryLink href="/app/community/photos/new" label={t("photos.publish")} compact /> : undefined} />
          {data.photos.length ? (
            <PostList posts={data.photos} context={context} locale={locale} labels={postLabels} />
          ) : <CommunityEmptyState icon={Camera} title={t("photos.empty")} action={context.canWrite ? <PrimaryLink href="/app/community/photos/new" label={t("photos.emptyAction")} /> : undefined} />}
        </section>
      )}

      {tab === "qa" && (
        <section>
          <CommunityHeader title={t("qa.title")} className="mb-3" />
          {data.faqs.length ? <FaqList faqs={data.faqs} labels={faqLabels(locale)} /> : <CommunityEmptyState icon={CircleHelp} title={t("qa.empty")} />}
        </section>
      )}

      {data.hasMore && (
        <LoadMoreLink href={`/app/community?tab=${tab}&sort=${sort}&page=${page + 1}`} label={t("common.loadMore")} />
      )}
    </div>
  )
}

function CommunitySection({ title, moreHref, moreLabel, children }: { title: string; moreHref: string; moreLabel: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionHeader title={title} action={<Link href={moreHref}>{moreLabel}</Link>} />
      {children}
    </section>
  )
}

function PostList({
  posts,
  context,
  locale,
  labels,
}: {
  posts: CommunityPost[]
  context: Awaited<ReturnType<typeof requireCommunityAccess>>
  locale: "zh" | "ja"
  labels: CommunityPostCardLabels
}) {
  return (
    <div className="space-y-3">
      {posts.map((post) => {
        const detailHref = `/app/community/${post.postType === "photo" ? "photos" : "treehole"}/${post.id}`
        return (
          <CommunityPostCard
            key={post.id}
            post={post}
            locale={locale}
            labels={labels}
            detailHref={detailHref}
            profileHref={post.author ? `/app/community/profile/${post.author.id}` : undefined}
            actions={<PostCardActions postId={post.id} detailHref={detailHref} initialLiked={post.likedByMe} initialLikeCount={post.likeCount} commentCount={post.commentCount} canWrite={context.canWrite} locale={locale} />}
            menu={<CommunityPostMenu post={post} locale={locale} />}
          />
        )
      })}
    </div>
  )
}

function PrimaryLink({ href, label, compact = false }: { href: string; label: string; compact?: boolean }) {
  return <Link href={href} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground ${compact ? "px-3 text-xs" : "px-4 text-sm"}`}><Plus className="size-4" />{label}</Link>
}

function SortLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{label}</Link>
}

function announcementLabels(locale: "zh" | "ja") {
  return {
    pinned: locale === "ja" ? "重要" : "置顶",
    expand: locale === "ja" ? "開く" : "展开",
    collapse: locale === "ja" ? "閉じる" : "收起",
    fallbackLanguage: { zh: "中文", ja: "日本語" },
  }
}

function faqLabels(locale: "zh" | "ja") {
  return {
    expand: locale === "ja" ? "回答を開く" : "展开回答",
    collapse: locale === "ja" ? "回答を閉じる" : "收起回答",
    fallbackLanguage: { zh: "中文", ja: "日本語" },
  }
}
