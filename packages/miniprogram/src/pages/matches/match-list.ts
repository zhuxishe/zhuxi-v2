import { resolveMiniMatchPartner } from '../../lib/match-detail'

export interface MiniMatchResult {
  id: string
  best_slot: string | null
  rank: number | null
  created_at: string
  status: string | null
  member_a_id: string
  member_b_id: string
  group_members: string[] | null
}

export interface MiniMatchListItem {
  match: MiniMatchResult
  partnerName: string
  groupMemberNames: string[]
  revieweeId: string | null
  reviewed: boolean
  isGroup: boolean
}

export function buildMiniMatchList(
  myMemberId: string,
  matches: MiniMatchResult[],
  nameMap: Map<string, string>,
  reviewedSet: Set<string>
): MiniMatchListItem[] {
  return matches.map((match) => {
    const partner = resolveMiniMatchPartner(
      myMemberId,
      match.group_members,
      nameMap,
      match
    )

    return {
      match,
      partnerName: partner.partnerName,
      groupMemberNames: partner.groupMemberNames,
      revieweeId: partner.revieweeId,
      reviewed: reviewedSet.has(match.id),
      isGroup: partner.isGroup,
    }
  })
}

