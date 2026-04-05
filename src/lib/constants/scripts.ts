// Script library constants

export const SCRIPT_GENRE_OPTIONS = [
  "推理", "情感", "恐怖", "欢乐", "机制", "阵营", "沉浸", "悬疑", "历史",
] as const

export const SCRIPT_THEME_OPTIONS = [
  "都市", "古风", "校园", "科幻", "奇幻", "民国", "现代", "日式", "西方",
] as const

export const SCRIPT_DIFFICULTY_OPTIONS = [
  { value: "beginner", label: "新手友好" },
  { value: "intermediate", label: "中等" },
  { value: "advanced", label: "进阶" },
] as const

export const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const
