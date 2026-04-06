import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { QuizPageClient } from "@/components/player/QuizPageClient"
import type { DimensionScores } from "@/lib/constants/personality-quiz"

export default async function QuizPage() {
  const player = await requirePlayer()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("personality_quiz_results")
    .select("scores, personality_type")
    .eq("member_id", player.memberId)
    .single()

  const initialResult = existing
    ? {
        scores: existing.scores as DimensionScores,
        personalityType: existing.personality_type as string,
      }
    : null

  return (
    <div className="px-4 py-6 pb-24">
      <h1 className="text-lg font-bold mb-6">ZSP-15 性格测试</h1>
      <QuizPageClient existing={initialResult} />
    </div>
  )
}
