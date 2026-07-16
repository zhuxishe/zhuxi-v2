import { notFound } from "next/navigation"
import { getLocale } from "next-intl/server"
import { CommunityPostDetail } from "../../_components/CommunityPostDetail"
import { requireCommunityAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { fetchCommunityPostDetail } from "@/lib/community/queries/posts"

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ comments?: string; comment?: string }>
}

export default async function TreeholeDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, query, context, rawLocale] = await Promise.all([params, searchParams, requireCommunityAccess(), getLocale()])
  const commentPage = Math.max(1, Math.min(20, Number.parseInt(query.comments ?? "1", 10) || 1))
  const targetCommentId = query.comment && /^[0-9a-f-]{36}$/i.test(query.comment) ? query.comment : undefined
  const detail = await fetchCommunityPostDetail(id, context.memberId, commentPage * 20, targetCommentId)
  if (!detail || detail.post.postType !== "treehole") notFound()
  return <CommunityPostDetail post={detail.post} comments={detail.comments} context={context} locale={normalizeCommunityLocale(rawLocale)} commentPage={commentPage} hasMoreComments={detail.hasMoreComments} />
}
