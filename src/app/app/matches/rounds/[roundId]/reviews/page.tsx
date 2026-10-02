import { getLocale } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchActivityReviewContext } from "@/lib/activity-reviews/queries"
import { ActivityReviewPageContent } from "@/components/player/activity-reviews/ActivityReviewPageContent"

export default async function ActivityReviewsPage({ params, searchParams }: {
  params: Promise<{ roundId: string }>
  searchParams: Promise<{ search?: string | string[]; page?: string | string[] }>
}) {
  await requirePlayer()
  const [{ roundId }, query, locale] = await Promise.all([params, searchParams, getLocale()])
  const search = typeof query.search === "string" ? query.search.slice(0, 80) : ""
  const parsedPage = typeof query.page === "string" ? Number(query.page) : 1
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 2_147_483_647 ? parsedPage : 1
  let context = await fetchActivityReviewContext(roundId, search, page)
  const lastPage = Math.max(1, Math.ceil(context.total / context.pageSize))
  if (context.page > lastPage) context = await fetchActivityReviewContext(roundId, search, lastPage)
  return <ActivityReviewPageContent key={`${roundId}:${context.search}:${context.page}:${context.settings.version}`} context={context} locale={locale} />
}
