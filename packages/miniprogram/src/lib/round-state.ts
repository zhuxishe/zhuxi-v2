export interface MiniOpenRound {
  id: string
  round_name: string | null
  survey_end: string | null
}

export interface MiniRoundCardState {
  title: string
  roundName: string
  statusText: string
  statusTone: 'done' | 'todo'
  deadlineText: string | null
  canOpenSurvey: boolean
}

export function buildMiniRoundCardState(
  openRound: MiniOpenRound | null,
  hasSubmission: boolean
): MiniRoundCardState | null {
  if (!openRound) return null
  return {
    title: '当前匹配轮次',
    roundName: openRound.round_name || '匹配进行中',
    statusText: hasSubmission ? '已提交 — 点击修改' : '未提交 — 点击填写',
    statusTone: hasSubmission ? 'done' : 'todo',
    deadlineText: openRound.survey_end ? `截止: ${String(openRound.survey_end).slice(0, 10)}` : null,
    canOpenSurvey: true,
  }
}
