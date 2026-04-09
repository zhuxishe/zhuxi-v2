// 性格自评维度的日语翻译映射

const JA_LABELS: Record<string, string> = {
  // 维度标题
  "外向度": "外向性",
  "主动度": "積極性",
  "表达风格": "表現スタイル",
  "群体角色": "グループでの役割",
  "熟络节奏": "打ち解けるペース",
  "计划性": "計画性",
  "合作竞技倾向": "協力・競争の傾向",
  "情绪稳定度": "感情の安定度",
  "边界强度": "パーソナルスペース",
  "回复节奏": "返信のペース",
}

const JA_DESCRIPTIONS: Record<string, string> = {
  "你在社交场合的能量来源": "社交の場でのエネルギー源",
  "你倾向于主动发起还是等待邀请": "自分から誘うタイプ？誘われ待ちタイプ？",
  "你的交流方式（可多选）": "あなたのコミュニケーションスタイル（複数選択可）",
  "你在团体中通常扮演的角色（可多选）": "グループで普段担う役割（複数選択可）",
  "你和新朋友熟悉的速度": "新しい友達と打ち解ける速さ",
  "你对活动安排的态度": "イベント計画に対する姿勢",
  "你在游戏中的偏好": "ゲームでの好み",
  "你在压力或意外情况下的情绪反应": "プレッシャーや予想外の状況での反応",
  "你对个人空间和隐私的要求": "個人のスペースやプライバシーへのこだわり",
  "你通常的消息回复速度": "普段のメッセージ返信速度",
}

const JA_OPTIONS: Record<string, string> = {
  // slider labels
  "内向安静": "内向的・静か",
  "外向活跃": "外向的・活発",
  "等待邀请": "誘われ待ち",
  "主动发起": "自分から誘う",
  "容易波动": "波がある",
  "非常稳定": "とても安定",
  // expression_style_tags
  "温和": "穏やか",
  "直率": "ストレート",
  "幽默": "ユーモア",
  "理性": "理性的",
  "倾听型": "聞き上手",
  // group_role_tags
  "组织者": "まとめ役",
  "破冰者": "ムードメーカー",
  "倾听者": "聞き役",
  "气氛组": "盛り上げ役",
  // warmup_speed
  "快速熟络": "すぐ仲良くなる",
  "先浅后深": "徐々に深まる",
  "慢热稳定": "ゆっくり安定型",
  // planning_style
  "计划型": "計画派",
  "半计划": "半計画派",
  "随性": "気まま派",
  // coop_compete_tendency
  "偏合作": "協力寄り",
  "均衡": "バランス型",
  "偏竞技": "競争寄り",
  // boundary_strength
  "柔软": "ゆるめ",
  "适中": "ふつう",
  "偏强": "しっかり",
  // reply_speed
  "秒回": "即レス",
  "当天": "当日中",
  "慢回可": "ゆっくりOK",
}

export function localizePersonalityLabel(text: string, locale: string): string {
  if (locale === "zh") return text
  return JA_LABELS[text] ?? text
}

export function localizePersonalityDesc(text: string, locale: string): string {
  if (locale === "zh") return text
  return JA_DESCRIPTIONS[text] ?? text
}

export function localizePersonalityOption(text: string, locale: string): string {
  if (locale === "zh") return text
  return JA_OPTIONS[text] ?? text
}
