import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { getLocale, getTranslations } from "next-intl/server"
import { QuizPageClient } from "@/components/player/QuizPageClient"
import { getQuizConfig } from "@/lib/queries/quiz-config"
import { getPlayerQuestionnaire } from "@/lib/questionnaires/server"
import { quizTemplateToConfig } from "@/lib/questionnaires/defaults"
import { questionnaireText } from "@/components/player/questionnaire-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function QuizPage() {
  const player = await requirePlayer()
  const locale = await getLocale()
  const t = await getTranslations("quiz")
  const supabase = await createClient()

  const [{ data: existing, error }, questionnaire] = await Promise.all([
    supabase
      .from("personality_quiz_results")
      .select("score_e, score_a, score_o, score_c, score_n, personality_type")
      .eq("member_id", player.memberId)
      .maybeSingle(),
    getPlayerQuestionnaire("quiz"),
  ])

  if (error) throw new Error("Unable to load the saved personality assessment")
  const quizConfig = questionnaire ? quizTemplateToConfig(questionnaire.template) : await getQuizConfig()

  const initialResult = existing && (!questionnaire || questionnaire.completed)
    ? {
        scores: { E: existing.score_e, A: existing.score_a, O: existing.score_o, C: existing.score_c, N: existing.score_n },
        personalityType: existing.personality_type as string,
      }
    : null

  return (
    <div className="px-4 py-6 pb-24">
      <Link href="/app/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("backToProfile")}
      </Link>
      <h1 className="text-lg font-bold mb-6">{questionnaire && !questionnaire.isBaseline ? questionnaireText(questionnaire.template.title, locale) : t("pageTitle")}</h1>
      <QuizPageClient existing={initialResult} quizConfig={quizConfig} questionnaire={questionnaire} />
    </div>
  )
}
