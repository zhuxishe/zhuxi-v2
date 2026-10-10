import type { MiniOpenRound } from './round-state'

type MiniRoundContent = Pick<MiniOpenRound, 'purpose' | 'content_config'>

/** The existing mini-program only renders the original matching questionnaire. */
export function supportsMiniRoundContent(round: MiniRoundContent) {
  if (round.purpose != null && round.purpose !== 'matching') return false
  if (round.content_config == null) return true
  if (typeof round.content_config !== 'object' || Array.isArray(round.content_config)) return false
  const config = round.content_config as Record<string, unknown>
  if (config.questions !== undefined && (!Array.isArray(config.questions) || config.questions.length > 0)) return false
  if (config.modules == null) return true
  if (typeof config.modules !== 'object' || Array.isArray(config.modules)) return false
  const modules = config.modules as Record<string, unknown>
  return ['interests', 'social', 'message'].every((key) => modules[key] !== false)
}

export function selectCompatibleMiniRound(rounds: MiniOpenRound[], now = new Date()) {
  return rounds.find((round) => {
    const start = Date.parse(round.survey_start ?? ''), end = Date.parse(round.survey_end ?? '')
    return !round.deleted_at && round.status === 'open' && Number.isFinite(start) && Number.isFinite(end)
      && start <= now.getTime() && now.getTime() < end && supportsMiniRoundContent(round)
  }) ?? null
}

/** Omit this column entirely when talking to a database that has not migrated. */
export function miniSubmissionRevision(revision: number | undefined) {
  return revision === undefined ? {} : { config_revision: revision }
}
