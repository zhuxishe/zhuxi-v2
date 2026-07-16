import { notFound, redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { TreeholeComposer } from "../../../_components/TreeholeComposer"
import { requireCommunityAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { fetchCommunityPostDetail } from "@/lib/community/queries/posts"

export default async function EditTreeholePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, context, rawLocale] = await Promise.all([params, requireCommunityAccess(), getLocale()])
  const detail = await fetchCommunityPostDetail(id, context.memberId, 1)
  if (!detail || detail.post.postType !== "treehole" || !detail.post.isMine) notFound()
  if (!context.profile) redirect("/app/profile/community?setup=1")
  return <TreeholeComposer profile={context.profile} locale={normalizeCommunityLocale(rawLocale)} post={detail.post} />
}
