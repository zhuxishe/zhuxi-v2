// Interview evaluation dimension labels (admin is Chinese-only, no i18n)

export interface EvalDimension {
  key: string
  label: string
  description: string
}

export const EVAL_DIMENSIONS: EvalDimension[] = [
  { key: "communication", label: "沟通能力", description: "语言表达和倾听能力" },
  { key: "articulation", label: "表达清晰度", description: "逻辑清晰、条理分明" },
  { key: "enthusiasm", label: "积极性", description: "对社团活动的热情和期待" },
  { key: "sincerity", label: "真诚度", description: "回答真实，不伪装" },
  { key: "social_comfort", label: "社交舒适度", description: "面对陌生人的自在程度" },
  { key: "humor", label: "幽默感", description: "交谈中的趣味性" },
  { key: "emotional_stability", label: "情绪稳定", description: "情绪管理和稳定性" },
  { key: "boundary_respect", label: "边界尊重", description: "对他人边界的理解和尊重" },
  { key: "team_orientation", label: "团队倾向", description: "合作意识和团队精神" },
  { key: "interest_alignment", label: "兴趣匹配", description: "与社团活动类型的契合度" },
  { key: "japanese_ability", label: "日语能力", description: "日语交流水平" },
  { key: "time_commitment", label: "时间承诺", description: "可投入活动的时间" },
  { key: "leadership_potential", label: "领导力", description: "组织和带领活动的潜力" },
  { key: "openness", label: "开放性", description: "接受新事物和不同观点" },
  { key: "responsibility", label: "责任感", description: "对承诺的重视程度" },
  { key: "first_impression", label: "第一印象", description: "整体气质和亲和力" },
  { key: "overall_recommendation", label: "总体推荐", description: "综合评估是否推荐入会" },
]

export const RISK_LEVEL_OPTIONS = [
  { value: "low", label: "低风险", color: "success" },
  { value: "medium", label: "中风险", color: "warning" },
  { value: "high", label: "高风险", color: "danger" },
] as const
