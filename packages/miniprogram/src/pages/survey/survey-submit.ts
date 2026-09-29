import { supportsMiniRoundContent } from '../../lib/round-compatibility'

export interface MiniSurveyRoundGuardInput {
  status: string | null
  survey_end: string | null
  survey_start?: string | null
  purpose?: string | null
  content_config?: unknown
  config_revision?: number
}

export function getMiniSurveyRoundError(
  round: MiniSurveyRoundGuardInput | null,
  now = new Date(),
  expectedRevision?: number
): string | null {
  if (!round) return '当前轮次不存在'
  if (round.status !== 'open') return '当前轮次已关闭'
  if (!round.survey_end || !Number.isFinite(Date.parse(round.survey_end)) || Date.parse(round.survey_end) <= now.getTime()) return '当前轮次已截止'
  if (round.survey_start && (!Number.isFinite(Date.parse(round.survey_start)) || Date.parse(round.survey_start) > now.getTime())) return '当前轮次尚未开放'
  if (!supportsMiniRoundContent(round)) return '本期内容已更新，请通过网页版交互工具填写；当前输入仍保留'
  if (round.config_revision !== expectedRevision) return '问卷内容已更新，请核对后重新打开；当前输入仍保留'
  return null
}

export function miniSurveySubmitError(message?: string) {
  if (message?.includes('ROUND_CONFIG_CHANGED')) return '问卷已更新，请重新核对；当前输入仍保留'
  if (message?.includes('ROUND_CLOSED') || message?.includes('row-level security')) return '本期已截止或暂不可提交；当前输入仍保留'
  return message || '提交失败'
}
