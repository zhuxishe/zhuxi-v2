import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requirePlayer } from "@/lib/auth/player"
import { getLocale, getTranslations } from "next-intl/server"
import { checkReviewExists } from "@/lib/queries/reviews"
import { MutualReviewForm } from "@/components/player/MutualReviewForm"
import { GroupReviewSelector } from "@/components/player/GroupReviewSelector"
import { fetchMatchDetail } from "@/lib/queries/matching"
import { parseRegistrationReturnContext, registrationReturnHref } from "@/lib/registration-review-gate/navigation"
import { ReviewRegistrationReturn } from "@/components/player/ReviewRegistrationReturn"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reviewee?: string; returnRound?: string | string[]; from?: string | string[] }>
}

/** 获取组员名字（admin client） */
async function fetchMemberNames(memberIds: string[]) {
  if (memberIds.length === 0) return []
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data } = await supabase
    .from("members")
    .select("id, member_identity (full_name, nickname)")
    .in("id", memberIds)

  return (data ?? []).map((m) => {
    const identity = Array.isArray(m.member_identity) ? m.member_identity[0] : m.member_identity
    return {
      id: m.id,
      name: (identity as Record<string, string> | null)?.full_name
        ?? (identity as Record<string, string> | null)?.nickname
        ?? "未知",
    }
  })
}

export default async function NewReviewPage({ params, searchParams }: Props) {
  const player = await requirePlayer()
  const t = await getTranslations("reviews")
  const common = await getTranslations("common")
  const { id: matchResultId } = await params
  const query = await searchParams
  const { reviewee: revieweeParam } = query
  const registrationReturn = parseRegistrationReturnContext(query)
  const locale = await getLocale()
  const returnQuery = new URLSearchParams()
  if (registrationReturn) {
    returnQuery.set("returnRound", registrationReturn.roundId)
    if (registrationReturn.fromParticipation) returnQuery.set("from", "participation")
  }
  const selectorHref = `/app/reviews/new/${matchResultId}${returnQuery.size ? `?${returnQuery}` : ""}`

  const mr = await fetchMatchDetail(matchResultId, player.memberId)
  if (!mr || mr.status !== "confirmed") notFound()

  const groupMembers = mr.group_members as string[] | null
  const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0
  const inMatch = isGroup ? groupMembers.includes(player.memberId) : mr.member_a_id === player.memberId || mr.member_b_id === player.memberId
  if (!inMatch) notFound()

  if (isGroup) {
    const otherIds = groupMembers.filter((id) => id !== player.memberId)

    if (!revieweeParam || !otherIds.includes(revieweeParam)) {
      const members = await fetchMemberNames(otherIds)
      const reviewedSet = new Set<string>()
      for (const m of members) {
        const { createAdminClient } = await import("@/lib/supabase/admin")
        const supabase = createAdminClient()
        const { data: existing } = await supabase
          .from("mutual_reviews")
          .select("id")
          .eq("match_result_id", matchResultId)
          .eq("reviewer_id", player.memberId)
          .eq("reviewee_id", m.id)
          .maybeSingle()
        if (existing) reviewedSet.add(m.id)
      }

      return (
        <div className="p-6">
          <ReviewBackLink href={`/app/matches/${matchResultId}`} label={common("back")} />
          <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mb-6">{t("selectReviewee")}</p>
          <ReviewRegistrationReturn context={registrationReturn} locale={locale} completed={reviewedSet.size > 0} />
          <GroupReviewSelector
            matchResultId={matchResultId}
            members={members}
            reviewedIds={[...reviewedSet]}
            registrationReturn={registrationReturn}
          />
        </div>
      )
    }

    const alreadyReviewed = await checkReviewExistsPair(matchResultId, player.memberId, revieweeParam)
    if (alreadyReviewed) redirect(registrationReturn ? registrationReturnHref(registrationReturn) : selectorHref)

    const [revieweeName] = await fetchMemberNames([revieweeParam])
    return (
      <div className="p-6">
        <ReviewBackLink href={selectorHref} label={common("back")} />
        <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("subtitle")} — {revieweeName?.name ?? ""}
        </p>
        <ReviewRegistrationReturn context={registrationReturn} locale={locale} completed={false} />
        <MutualReviewForm
          reviewerId={player.memberId}
          revieweeId={revieweeParam}
          matchResultId={matchResultId}
          publicationVersion={mr.publication_version}
          registrationReturn={registrationReturn}
        />
      </div>
    )
  }

  // 双人配对
  const revieweeId = mr.member_a_id === player.memberId ? mr.member_b_id : mr.member_a_id
  if (!revieweeId) notFound()

  const alreadyReviewed = await checkReviewExists(matchResultId, player.memberId)
  if (alreadyReviewed) redirect(registrationReturn ? registrationReturnHref(registrationReturn) : "/app/matches#matching")

  return (
    <div className="p-6">
      <ReviewBackLink href={`/app/matches/${matchResultId}`} label={common("back")} />
      <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>
      <ReviewRegistrationReturn context={registrationReturn} locale={locale} completed={false} />
      <MutualReviewForm
        reviewerId={player.memberId}
        revieweeId={revieweeId}
        matchResultId={matchResultId}
        publicationVersion={mr.publication_version}
        registrationReturn={registrationReturn}
      />
    </div>
  )
}

function ReviewBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}

/** 精确检查某个 reviewer→reviewee 是否已评价 */
async function checkReviewExistsPair(matchResultId: string, reviewerId: string, revieweeId: string) {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("mutual_reviews")
    .select("id")
    .eq("match_result_id", matchResultId)
    .eq("reviewer_id", reviewerId)
    .eq("reviewee_id", revieweeId)
    .maybeSingle()
  return !!data
}
