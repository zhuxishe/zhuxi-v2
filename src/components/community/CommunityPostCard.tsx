import Link from "next/link"
import type { ReactNode } from "react"
import { Heart, MessageCircle } from "lucide-react"
import type {
  CommunityComment,
  CommunityLocale,
  CommunityPost,
} from "@/lib/community/types"
import { cn } from "@/lib/utils"
import { CommunityAvatar } from "./CommunityAvatar"
import { PhotoGrid } from "./PhotoGrid"
import { formatCommunityDate } from "./community-format"

export interface CommunityPostCardLabels {
  anonymousMember: string
  anonymous: string
  anonymousAuthor: string
  edited: string
  likes: string
  comments: string
  viewAllComments: string
  deletedComment: string
  hiddenComment: string
  image: string
  openPost: string
}

interface CommunityPostCardProps {
  post: CommunityPost
  locale: CommunityLocale
  labels: CommunityPostCardLabels
  detailHref?: string
  profileHref?: string
  actions?: ReactNode
  menu?: ReactNode
  media?: ReactNode
  expanded?: boolean
  className?: string
}

export function CommunityPostCard({
  post,
  locale,
  labels,
  detailHref,
  profileHref,
  actions,
  menu,
  media,
  expanded = false,
  className,
}: CommunityPostCardProps) {
  const authorName = post.isAnonymous || !post.author ? labels.anonymousMember : post.author.nickname
  const authorProfileHref = !post.isAnonymous && post.author ? profileHref : undefined
  const authorContent = (
    <>
      <CommunityAvatar profile={post.isAnonymous ? null : post.author} alt="" size="md" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{authorName}</span>
          {post.isAnonymous ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
              {labels.anonymous}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {formatCommunityDate(post.publishedAt, locale)}
          {post.editedAt ? ` · ${labels.edited}` : ""}
        </span>
      </span>
    </>
  )

  const textContent = (
    <>
      {post.title ? (
        <h3 className="line-clamp-2 text-base font-semibold leading-6 text-foreground">{post.title}</h3>
      ) : null}
      {post.body ? (
        <p className={cn("whitespace-pre-wrap text-sm leading-6 text-foreground", post.title ? "mt-2" : "", !expanded && "line-clamp-4")}>
          {post.body}
        </p>
      ) : null}
    </>
  )

  return (
    <article className={cn("rounded-[20px] bg-card p-4 shadow-soft", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {authorProfileHref ? (
          <Link
            href={authorProfileHref}
            className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {authorContent}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-3">{authorContent}</div>
        )}
        {menu ? <div className="shrink-0">{menu}</div> : null}
      </div>

      {post.title || post.body ? (
        detailHref ? (
          <Link
            href={detailHref}
            aria-label={`${labels.openPost}: ${post.title || authorName}`}
            className="mt-3 block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {textContent}
          </Link>
        ) : (
          <div className="mt-3">{textContent}</div>
        )
      ) : null}

      {media ?? (post.postType === "photo" && post.images.length > 0 ? (
        <PhotoGrid
          images={post.images}
          authorLabel={authorName}
          imageLabel={labels.image}
          detailHref={detailHref}
          className="mt-3"
        />
      ) : null)}

      <div className="mt-3 border-t border-border pt-2.5">
        {actions ? (
          actions
        ) : (
          <div className="flex min-h-11 items-center gap-5 text-sm text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1.5", post.likedByMe && "font-semibold text-primary")}>
              <Heart className="size-[18px]" fill={post.likedByMe ? "currentColor" : "none"} aria-hidden="true" />
              <span>{post.likeCount}</span>
              <span className="sr-only">{labels.likes}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-[18px]" aria-hidden="true" />
              <span>{post.commentCount}</span>
              <span className="sr-only">{labels.comments}</span>
            </span>
          </div>
        )}
      </div>

      {post.commentsPreview.length > 0 ? (
        <div className="mt-2 space-y-1.5 rounded-xl bg-secondary/55 px-3 py-2.5">
          {post.commentsPreview.slice(0, 2).map((comment) => (
            <CommentLine key={comment.id} comment={comment} labels={labels} />
          ))}
          {post.commentCount > post.commentsPreview.length ? (
            detailHref ? (
              <Link
                href={detailHref}
                className="inline-flex min-h-11 items-center text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {labels.viewAllComments.replace("{count}", String(post.commentCount))}
              </Link>
            ) : (
              <p className="text-xs font-semibold text-primary">
                {labels.viewAllComments.replace("{count}", String(post.commentCount))}
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function CommentLine({
  comment,
  labels,
}: {
  comment: CommunityComment
  labels: CommunityPostCardLabels
}) {
  const author = comment.isAnonymousAuthor
    ? labels.anonymousAuthor
    : comment.author?.nickname ?? labels.anonymousMember
  const body = comment.status === "deleted"
    ? (comment.removalSource === "admin" ? labels.hiddenComment : labels.deletedComment)
    : comment.status === "hidden"
      ? labels.hiddenComment
      : comment.body

  return (
    <p className="text-xs leading-5 text-foreground">
      <span className="font-semibold">{author}</span>
      {body ? <span className="ml-1 text-muted-foreground">{body}</span> : null}
    </p>
  )
}
