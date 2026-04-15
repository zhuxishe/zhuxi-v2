import { supabaseQuery } from './supabase'
import { MiniOpenRound } from './round-state'

export async function fetchMiniOpenRound(): Promise<MiniOpenRound | null> {
  const rounds = await supabaseQuery<MiniOpenRound[]>('match_rounds', {
    select: 'id,round_name,survey_end',
    status: 'eq.open',
    order: 'survey_end.asc',
    limit: '1',
  })
  return rounds?.[0] ?? null
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
