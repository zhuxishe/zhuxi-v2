import { redirect } from "next/navigation"
import { requireAuth, getPlayerInfo } from "@/lib/auth/player"
import { PreInterviewForm } from "@/components/player/PreInterviewForm"

export default async function AppInterviewFormPage() {
  await requireAuth()

  // Approved/inactive users should not access interview form
  const player = await getPlayerInfo()
  if (player && player.status === "approved") redirect("/app")
  if (player && player.status === "inactive") redirect("/app")

  return <PreInterviewForm />
}
