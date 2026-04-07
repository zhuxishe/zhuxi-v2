"use client"

import { RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import type { DimensionScores } from "@/lib/constants/personality-quiz"

interface Props {
  scores: DimensionScores
  personalityType: string
  onRetake?: () => void
}

const DIMENSION_COLORS: Record<string, string> = {
  E: "bg-coral", A: "bg-sakura", O: "bg-sky", C: "bg-gold", N: "bg-lavender",
}

const DIMENSION_BG: Record<string, string> = {
  E: "bg-coral-light", A: "bg-sakura-light", O: "bg-sky-light",
  C: "bg-gold-light", N: "bg-lavender-light",
}

export function QuizResult({ scores, personalityType, onRetake }: Props) {
  const t = useTranslations("quiz")

  const dimensions = (["E", "A", "O", "C", "N"] as const).map((key) => ({
    key,
    label: t(`dimensionLabels.${key}`),
    value: key === "N" ? 100 - scores[key] : scores[key],
    displayLabel: key === "N" ? t("emotionalStability") : t(`dimensionLabels.${key}`),
    color: DIMENSION_COLORS[key],
    bg: DIMENSION_BG[key],
  }))

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Type card */}
      <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10 text-center space-y-3 animate-scale-in">
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          {t("yourStyle")}
        </p>
        <h2 className="text-2xl font-bold font-display tracking-wide">
          {personalityType}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t.has(`typeDescriptions.${personalityType}`) ? t(`typeDescriptions.${personalityType}`) : t("defaultDescription")}
        </p>
      </div>

      {/* Dimension bars */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4 animate-fade-in-up">
        <p className="text-sm font-semibold">{t("dimensionDetails")}</p>
        {dimensions.map((dim) => (
          <div key={dim.key} className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{dim.displayLabel}</span>
              <span className="font-medium">{dim.value}</span>
            </div>
            <div className={`h-3 rounded-full ${dim.bg} overflow-hidden`}>
              <div
                className={`h-full rounded-full ${dim.color} transition-all duration-700 ease-out`}
                style={{ width: `${Math.max(dim.value, 3)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Retake button */}
      {onRetake && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onRetake}>
            <RotateCcw className="size-4" />
            {t("retake")}
          </Button>
        </div>
      )}
    </div>
  )
}
