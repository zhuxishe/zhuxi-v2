import Link from "next/link"
import { ArrowLeft, MessageCircle } from "lucide-react"
import { CommunityPostCard, type CommunityPostCardLabels } from "@/components/community/CommunityPostCard"
import { LoadMoreLink } from "@/components/community/LoadMoreLink"
import { CommentThread } from "./CommentThread"
import { CommunityPostMenu } from "./CommunityPostMenu"
import { PhotoViewer } from "./PhotoViewer"
import { PostCardActions } from "./PostCardActions"
import type { CommunityComment, CommunityContext, CommunityPost } from "@/lib/community/types"

interface CommunityPostDetailProps {
  post: CommunityPost
  comments: CommunityComment[]
  context: CommunityContext
  locale: "zh" | "ja"
  commentPage: number
  hasMoreComments: boolean
}

export function CommunityPostDetail({ post, comments, context, locale, commentPage, hasMoreComments }: CommunityPostDetailProps) {
  const isPhoto = post.postType === "photo"
  const detailHref = `/app/community/${isPhoto ? "photos" : "treehole"}/${post.id}`
  const labels: CommunityPostCardLabels = {
    anonymousMember: locale === "ja" ? "匿名会員" : "匿名会员",
    anonymous: "匿名",
    anonymousAuthor: locale === "ja" ? "匿名の投稿者" : "匿名楼主",
    edited: locale === "ja" ? "編集済み" : "已编辑",
    likes: locale === "ja" ? "いいね" : "点赞",
    comments: locale === "ja" ? "コメント" : "评论",
    viewAllComments: locale === "ja" ? "コメント {count}件をすべて見る" : "查看全部 {count} 条评论",
    deletedComment: locale === "ja" ? "投稿者がこのコメントを削除しました" : "该评论已由作者删除",
    hiddenComment: locale === "ja" ? "管理者がこのコメントを削除しました" : "该评论已由管理员移除",
    image: locale === "ja" ? "写真" : "照片",
    openPost: locale === "ja" ? "投稿を開く" : "打开动态",
  }

  return (
    <div className="px-4 pb-28 pt-3">
      <div className="mb-3 flex min-h-12 items-center gap-2">
        <Link href={`/app/community?tab=${isPhoto ? "album" : "treehole"}`} aria-label={locale === "ja" ? "戻る" : "返回"} className="grid size-11 place-items-center rounded-full hover:bg-primary/10"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-base font-semibold">{isPhoto ? (locale === "ja" ? "写真投稿" : "照片动态") : (locale === "ja" ? "投稿詳細" : "树洞详情")}</h1>
      </div>

      <CommunityPostCard
        post={{ ...post, commentsPreview: [] }}
        locale={locale}
        labels={labels}
        expanded
        profileHref={post.author ? `/app/community/profile/${post.author.id}` : undefined}
        media={isPhoto ? <PhotoViewer images={post.images} authorLabel={post.author?.nickname ?? labels.anonymousMember} locale={locale} /> : undefined}
        actions={<PostCardActions postId={post.id} detailHref={detailHref} initialLiked={post.likedByMe} initialLikeCount={post.likeCount} commentCount={post.commentCount} canWrite={context.canWrite} locale={locale} />}
        menu={<CommunityPostMenu post={post} locale={locale} />}
      />

      <section className="mt-6" aria-labelledby="comments-heading">
        <div className="mb-3 flex min-h-11 items-center gap-2">
          <MessageCircle className="size-5 text-primary" />
          <h2 id="comments-heading" className="font-semibold">{locale === "ja" ? `コメント ${post.commentCount}件` : `${post.commentCount} 条评论`}</h2>
        </div>
        {comments.length ? (
          <CommentThread postId={post.id} comments={comments} canWrite={context.canWrite} locale={locale} />
        ) : (
          <>
            <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-soft">
              {locale === "ja" ? "まだコメントはありません" : "还没有评论"}
            </p>
            <CommentThread postId={post.id} comments={[]} canWrite={context.canWrite} locale={locale} />
          </>
        )}
        {hasMoreComments && (
          <LoadMoreLink className="mt-4" href={`${detailHref}?comments=${commentPage + 1}`} label={locale === "ja" ? "コメントをさらに表示" : "加载更多评论"} />
        )}
      </section>
    </div>
  )
}
