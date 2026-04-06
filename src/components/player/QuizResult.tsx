"use client"

import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DimensionScores } from "@/lib/constants/personality-quiz"

interface Props {
  scores: DimensionScores
  personalityType: string
  onRetake?: () => void
}

/** 类型 -> 一句话描述 */
const TYPE_DESCRIPTIONS: Record<string, string> = {
  "热情守护者": "你总能让身边的人感到被关注和被欢迎",
  "热情探索者": "新地方、新朋友、新体验——你全都要",
  "热情规划者": "你用热情点燃气氛，用计划让一切井然有序",
  "热情安定者": "在任何社交场合都如鱼得水，而且从不紧张",
  "温暖行动派": "你关心每个人，而且会用行动表达出来",
  "温暖探索者": "对新事物充满好奇，但始终把身边人的感受放在心上",
  "温暖规划者": "你总是那个默默准备好一切、又照顾到每个人的人",
  "温暖安定者": "你的温柔和从容让身边的人都感到安心",
  "好奇行动派": "一听到「没试过」三个字就两眼放光",
  "好奇守护者": "喜欢带朋友一起探索新事物，确保大家都跟上",
  "好奇规划者": "冒险也要有攻略——你是有策略的探索家",
  "好奇安定者": "对未知充满兴趣，但心态始终平稳",
  "稳健行动派": "你是最靠谱的执行者，说到做到",
  "稳健守护者": "你细心又负责，团队有你在就放心",
  "稳健探索者": "喜欢有计划地尝试新事物——冒险也要有策略",
  "稳健安定者": "你是团队里最让人安心的存在",
  "从容行动派": "什么场面你都能hold住，而且乐在其中",
  "从容守护者": "你的淡定是会传染的，身边的人因为你而放松",
  "从容探索者": "面对未知毫不慌张，享受每一次新鲜体验",
  "从容规划者": "你心中有数、脚下有路，从不焦虑",
}

const DIMENSION_LABELS: Record<string, string> = {
  E: "社交能量", A: "社交温度", O: "探索倾向", C: "行动节奏", N: "情绪敏感",
}

const DIMENSION_COLORS: Record<string, string> = {
  E: "bg-coral", A: "bg-sakura", O: "bg-sky", C: "bg-gold", N: "bg-lavender",
}

const DIMENSION_BG: Record<string, string> = {
  E: "bg-coral-light", A: "bg-sakura-light", O: "bg-sky-light",
  C: "bg-gold-light", N: "bg-lavender-light",
}

function getDescription(type: string): string {
  return TYPE_DESCRIPTIONS[type] ?? "你有着独特的社交风格，让身边的人印象深刻"
}

export function QuizResult({ scores, personalityType, onRetake }: Props) {
  const dimensions = (["E", "A", "O", "C", "N"] as const).map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    value: key === "N" ? 100 - scores[key] : scores[key],
    displayLabel: key === "N" ? "情绪稳定" : DIMENSION_LABELS[key],
    color: DIMENSION_COLORS[key],
    bg: DIMENSION_BG[key],
  }))

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Type card */}
      <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10 text-center space-y-3 animate-scale-in">
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          你的社交风格
        </p>
        <h2 className="text-2xl font-bold font-display tracking-wide">
          {personalityType}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {getDescription(personalityType)}
        </p>
      </div>

      {/* Dimension bars */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4 animate-fade-in-up">
        <p className="text-sm font-semibold">维度详情</p>
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
            重新测试
          </Button>
        </div>
      )}
    </div>
  )
}
