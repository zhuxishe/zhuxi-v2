import Link from "next/link"
import { getLocale } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { CommunityNotificationList } from "../_components/CommunityNotificationList"
import { LoadMoreLink } from "@/components/community/LoadMoreLink"
import { requireCommunityNotificationAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { fetchCommunityNotifications } from "@/lib/community/queries/notifications"

interface PageProps { searchParams: Promise<{ filter?: string; page?: string }> }

export default async function CommunityNotificationsPage({ searchParams }: PageProps) {
  const [params, context, rawLocale] = await Promise.all([searchParams, requireCommunityNotificationAccess(), getLocale()])
  const locale = normalizeCommunityLocale(rawLocale)
  const unreadOnly = params.filter === "unread"
  const page = Math.max(1, Math.min(10, Number.parseInt(params.page ?? "1", 10) || 1))
  const limit = page * 20
  const data = await fetchCommunityNotifications(context.memberId, locale, { limit: limit + 1, unreadOnly })
  const hasMore = data.items.length > limit
  const backHref = context.restriction?.type === "permanent_ban" ? "/app" : "/app/community"

  return (
    <div className="px-4 pb-7 pt-3">
      <div className="flex min-h-12 items-center gap-2"><Link href={backHref} aria-label="返回" className="grid size-11 place-items-center rounded-full"><ArrowLeft className="size-5" /></Link><h1 className="heading-display text-2xl">{locale === "ja" ? "通知" : "通知"}</h1></div>
      <div className="mb-4 mt-2 flex gap-2">
        <Link href="/app/community/notifications" aria-current={!unreadOnly ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium ${!unreadOnly ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{locale === "ja" ? "すべて" : "全部"}</Link>
        <Link href="/app/community/notifications?filter=unread" aria-current={unreadOnly ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium ${unreadOnly ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{locale === "ja" ? "未読" : "未读"}</Link>
      </div>
      <CommunityNotificationList items={data.items.slice(0, limit)} locale={locale} />
      {hasMore && <LoadMoreLink className="mt-4" href={`/app/community/notifications?filter=${unreadOnly ? "unread" : "all"}&page=${page + 1}`} label={locale === "ja" ? "さらに読み込む" : "加载更多"} />}
    </div>
  )
}
