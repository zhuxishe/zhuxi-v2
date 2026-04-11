"use client"

import { useRef, useState } from "react"
import { RotateCcw, Share2, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import type { DimensionScores } from "@/lib/constants/personality-quiz"
import type { Dimension, DimensionConfig, TypeLabelsConfig, TypeDescription } from "@/types/quiz-config"

interface Props {
  scores: DimensionScores
  personalityType: string
  dimensions?: Record<Dimension, DimensionConfig>
  typeLabels?: TypeLabelsConfig
  typeDescriptions?: Record<string, TypeDescription>
  onRetake?: () => void
}

const DIM_COLORS: Record<string, string> = {
  E: "bg-coral", A: "bg-sakura", O: "bg-sky", C: "bg-gold", N: "bg-lavender",
}
const DIM_BG: Record<string, string> = {
  E: "bg-coral-light", A: "bg-sakura-light", O: "bg-sky-light",
  C: "bg-gold-light", N: "bg-lavender-light",
}

function getDimDescription(dim: Dimension, value: number, dims?: Record<Dimension, DimensionConfig>) {
  if (!dims?.[dim]?.descriptions) return null
  const d = dims[dim].descriptions
  return value <= 33 ? d.low : value <= 66 ? d.mid : d.high
}

function generateFunType(scores: DimensionScores, labels: TypeLabelsConfig): string {
  const mapped = { E: scores.E, A: scores.A, O: scores.O, C: scores.C, ES: 100 - scores.N }
  const sorted = Object.entries(mapped).sort(([, a], [, b]) => b - a)
  return `${labels.fun.prefix[sorted[0][0]] ?? ""}${labels.fun.suffix[sorted[1][0]] ?? ""}`
}

export function QuizResult({ scores, personalityType, dimensions: dimConfig, typeLabels, typeDescriptions, onRetake }: Props) {
  const t = useTranslations("quiz")
  const cardRef = useRef<HTMLDivElement>(null)
  const [showFun, setShowFun] = useState(false)

  const funType = typeLabels ? generateFunType(scores, typeLabels) : null
  const displayType = showFun && funType ? funType : personalityType
  const typeDesc = typeDescriptions?.[personalityType]

  const dims = (["E", "A", "O", "C", "N"] as const).map((key) => ({
    key,
    value: key === "N" ? 100 - scores[key] : scores[key],
    displayLabel: key === "N"
      ? t("emotionalStability")
      : (dimConfig?.[key]?.name ?? t(`dimensionLabels.${key}`)),
    color: DIM_COLORS[key],
    bg: DIM_BG[key],
  }))

  async function handleShare() {
    if (!cardRef.current) return
    try {
      const { default: html2canvas } = await import("html2canvas-pro")
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2 })
      canvas.toBlob((blob) => {
        if (!blob) return
        if (navigator.share) {
          const file = new File([blob], "personality.png", { type: "image/png" })
          navigator.share({ files: [file] }).catch(() => {})
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = "personality.png"
          a.click()
          URL.revokeObjectURL(url)
        }
      }, "image/png")
    } catch { /* html2canvas not available */ }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Shareable card */}
      <div ref={cardRef} className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10 space-y-5">
        {/* Type image + header */}
        <div className="text-center space-y-3">
          {typeDesc?.imageUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={typeDesc.imageUrl}
                alt={personalityType}
                className="w-96 h-auto object-contain drop-shadow-md"
                onError={(e) => { e.currentTarget.style.display = "none" }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground tracking-widest uppercase">{t("yourStyle")}</p>
          <h2 className="text-2xl font-bold font-display tracking-wide animate-scale-in">
            {displayType}
          </h2>
          {funType && (
            <button
              onClick={() => setShowFun(!showFun)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Sparkles className="size-3" />
              {showFun ? t("viewFormal") : t("viewFun")}
            </button>
          )}
        </div>

        {/* Type description */}
        {typeDesc?.description && (
          <p className="text-sm text-muted-foreground leading-relaxed text-center px-2">
            {typeDesc.description}
          </p>
        )}

        {/* Dimension bars with descriptions */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold text-muted-foreground">{t("dimensionDetails")}</p>
          {dims.map((dim) => (
            <div key={dim.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{dim.displayLabel}</span>
                <span className="font-medium">{dim.value}</span>
              </div>
              <div className={`h-2.5 rounded-full ${dim.bg} overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${dim.color} transition-all duration-700 ease-out`}
                  style={{ width: `${Math.max(dim.value, 3)}%` }}
                />
              </div>
              {(() => {
                const desc = getDimDescription(dim.key, dim.value, dimConfig)
                return desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null
              })()}
            </div>
          ))}
        </div>

        {/* Watermark */}
        <p className="text-center text-[10px] text-muted-foreground/50 pt-1">竹溪社 ZSP-15</p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={handleShare}>
          <Share2 className="size-4" />
          {t("saveShare")}
        </Button>
        {onRetake && (
          <Button variant="outline" onClick={onRetake}>
            <RotateCcw className="size-4" />
            {t("retake")}
          </Button>
        )}
      </div>
    </div>
  )
}
