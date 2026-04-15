export interface MiniSurveyRoundGuardInput {
  status: string | null
  survey_end: string | null
}

export function getMiniSurveyRoundError(
  round: MiniSurveyRoundGuardInput | null,
  now = new Date()
): string | null {
  if (!round) return '当前轮次不存在'
  if (round.status !== 'open') return '当前轮次已关闭'
  if (round.survey_end && new Date(round.survey_end) < now) return '当前轮次已截止'
  return null
}
