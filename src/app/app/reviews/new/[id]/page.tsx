import { requirePlayer } from "@/lib/auth/player"
import { getTranslations } from "next-intl/server"
import { MutualReviewForm } from "@/components/player/MutualReviewForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function NewReviewPage({ params }: Props) {
  const player = await requirePlayer()
  const t = await getTranslations("reviews")
  const { id: revieweeId } = await params

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>
      <MutualReviewForm reviewerId={player.memberId} revieweeId={revieweeId} />
    </div>
  )
}
