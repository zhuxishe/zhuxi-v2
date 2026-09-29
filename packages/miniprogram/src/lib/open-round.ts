import { supabaseQuery } from './supabase'
import { MiniOpenRound } from './round-state'
import { selectCompatibleMiniRound } from './round-compatibility'

export async function fetchMiniOpenRound(now = new Date()): Promise<MiniOpenRound | null> {
  for (let offset = 0; ; offset += 100) {
    const rounds = await supabaseQuery<MiniOpenRound[]>('match_rounds', {
      select: '*', status: 'eq.open',
      survey_start: `lte.${now.toISOString()}`, survey_end: `gt.${now.toISOString()}`,
      order: 'survey_end.asc,id.asc', limit: '100', offset: String(offset),
    })
    const compatible = selectCompatibleMiniRound(rounds ?? [], now)
    if (compatible) return compatible
    if (!rounds || rounds.length < 100) return null
  }
}

export async function loadMiniRoundState(memberId: string) {
  const openRound = await fetchMiniOpenRound()
  if (!openRound) return { openRound: null, hasSubmission: false }

  const submissions = await supabaseQuery<any[]>('match_round_submissions', {
    select: 'id',
    round_id: `eq.${openRound.id}`,
    member_id: `eq.${memberId}`,
  })

  return {
    openRound,
    hasSubmission: !!submissions?.length,
  }
}
