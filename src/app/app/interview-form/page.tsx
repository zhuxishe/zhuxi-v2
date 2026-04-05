import { requireAuth } from "@/lib/auth/player"
import { PreInterviewForm } from "@/components/player/PreInterviewForm"

export default async function AppInterviewFormPage() {
  await requireAuth()
  return <PreInterviewForm />
}
