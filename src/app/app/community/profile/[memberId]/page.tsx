import Link from "next/link"
import { notFound } from "next/navigation"
import { getLocale } from "next-intl/server"
import { ArrowLeft, Camera, MessageCircle } from "lucide-react"
import { CommunityAvatar } from "@/components/community/CommunityAvatar"
import { CommunityEmptyState } from "@/components/community/CommunityEmptyState"
import { CommunityPostCard, type CommunityPostCardLabels } from "@/components/community/CommunityPostCard"
import { SectionHeader } from "@/components/community/SectionHeader"
import { CommunityPostMenu } from "../../_components/CommunityPostMenu"
import { CommunityProfileActions } from "../../_components/CommunityProfileActions"
import { PostCardActions } from "../../_components/PostCardActions"
import { requireCommunityAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { fetchCommunityPublicProfile } from "@/lib/community/queries/profiles"
import type { CommunityPost } from "@/lib/community/types"

interface PageProps { params: Promise<{ memberId: string }> }

export default async function CommunityProfilePage({ params }: PageProps) {
  const [{ memberId }, context, rawLocale] = await Promise.all([params, requireCommunityAccess(), getLocale()])
  const locale = normalizeCommunityLocale(rawLocale)
  const data = await fetchCommunityPublicProfile({ profileId: memberId, viewerMemberId: context.memberId })
  if (!data) notFound()
  const self = context.profile?.id === data.profile.id
  const labels = postLabels(locale)
  const date = new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "zh-CN", { year: "numeric", month: "long" }).format(new Date(data.profile.joinedAt))

  return (
    <div className="space-y-6 px-4 pb-7 pt-3">
      <div className="flex min-h-12 items-center gap-2"><Link href="/app/community" aria-label="返回" className="grid size-11 place-items-center rounded-full"><ArrowLeft className="size-5" /></Link><h1 className="font-semibold">{locale === "ja" ? "コミュニティプロフィール" : "社区主页"}</h1></div>
      <section className="rounded-2xl bg-card p-5 text-center shadow-soft">
        <CommunityAvatar profile={data.profile} size="lg" className="mx-auto" alt={data.profile.nickname} />
        <h2 className="mt-3 text-lg font-semibold">{data.profile.nickname}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{locale === "ja" ? `${date}から参加` : `加入社区于 ${date}`}</p>
        {!self && <CommunityProfileActions profileId={data.profile.id} locale={locale} />}
      </section>
      <section><SectionHeader title={locale === "ja" ? "公開つぶやき" : "公开树洞"} />{data.treeholes.length ? <ProfilePostList posts={data.treeholes} context={context} locale={locale} labels={labels} /> : <CommunityEmptyState icon={MessageCircle} title={locale === "ja" ? "公開投稿はまだありません" : "还没有公开树洞"} />}</section>
      <section><SectionHeader title={locale === "ja" ? "写真投稿" : "照片动态"} />{data.photos.length ? <ProfilePostList posts={data.photos} context={context} locale={locale} labels={labels} /> : <CommunityEmptyState icon={Camera} title={locale === "ja" ? "写真投稿はまだありません" : "还没有照片动态"} />}</section>
    </div>
  )
}

function ProfilePostList({ posts, context, locale, labels }: { posts: CommunityPost[]; context: Awaited<ReturnType<typeof requireCommunityAccess>>; locale: "zh" | "ja"; labels: CommunityPostCardLabels }) {
  return <div className="space-y-3">{posts.map((post) => { const href = `/app/community/${post.postType === "photo" ? "photos" : "treehole"}/${post.id}`; return <CommunityPostCard key={post.id} post={post} locale={locale} labels={labels} detailHref={href} profileHref={post.author ? `/app/community/profile/${post.author.id}` : undefined} actions={<PostCardActions postId={post.id} detailHref={href} initialLiked={post.likedByMe} initialLikeCount={post.likeCount} commentCount={post.commentCount} canWrite={context.canWrite} locale={locale} />} menu={<CommunityPostMenu post={post} locale={locale} />} /> })}</div>
}

function postLabels(locale: "zh" | "ja"): CommunityPostCardLabels {
  return { anonymousMember: locale === "ja" ? "匿名会員" : "匿名会员", anonymous: "匿名", anonymousAuthor: locale === "ja" ? "匿名の投稿者" : "匿名楼主", edited: locale === "ja" ? "編集済み" : "已编辑", likes: locale === "ja" ? "いいね" : "点赞", comments: locale === "ja" ? "コメント" : "评论", viewAllComments: locale === "ja" ? "コメント {count}件をすべて見る" : "查看全部 {count} 条评论", deletedComment: locale === "ja" ? "投稿者がこのコメントを削除しました" : "该评论已由作者删除", hiddenComment: locale === "ja" ? "管理者がこのコメントを削除しました" : "该评论已由管理员移除", image: locale === "ja" ? "写真" : "照片", openPost: locale === "ja" ? "投稿を開く" : "打开动态" }
}
