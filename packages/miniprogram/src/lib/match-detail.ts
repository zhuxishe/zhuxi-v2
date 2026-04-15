interface MatchPairInput {
  member_a_id: string
  member_b_id: string
}

interface MatchParticipantInput extends MatchPairInput {
  group_members?: string[] | null
}

export interface MiniPartnerProfile {
  hobbyTags: string[]
  gameTypePref: string | null
  scenarioThemeTags: string[]
  expressionStyleTags: string[]
  groupRoleTags: string[]
}

export function resolveMiniMatchPartner(
  myId: string,
  groupMembers: string[] | null,
  nameMap: Map<string, string>,
  match: MatchPairInput
) {
  const isGroup = Array.isArray(groupMembers) && groupMembers.length > 0
  if (isGroup) {
    const groupMemberNames = groupMembers
      .filter((id) => id !== myId)
      .map((id) => nameMap.get(id) ?? '')
      .filter(Boolean)

    return {
      partnerName: `${groupMembers.length}人组`,
      groupMemberNames,
      revieweeId: null,
      isGroup: true,
    }
  }

  const revieweeId = match.member_a_id === myId ? match.member_b_id : match.member_a_id
  return {
    partnerName: nameMap.get(revieweeId) ?? '未知成员',
    groupMemberNames: [],
    revieweeId,
    isGroup: false,
  }
}

export function isMiniMatchParticipant(myId: string, match: MatchParticipantInput) {
  return (
    match.member_a_id === myId ||
    match.member_b_id === myId ||
    (Array.isArray(match.group_members) && match.group_members.includes(myId))
  )
}

export function buildMiniMatchTagGroups(profile: MiniPartnerProfile) {
  const groups: { label: string; tags: string[] }[] = []
  if (profile.hobbyTags.length > 0) {
    groups.push({ label: '兴趣标签', tags: profile.hobbyTags.slice(0, 5) })
  }
  const socialTags = [...profile.expressionStyleTags, ...profile.groupRoleTags]
  if (socialTags.length > 0) {
    groups.push({ label: '社交风格', tags: socialTags.slice(0, 4) })
  }
  const gameTags = profile.gameTypePref ? [profile.gameTypePref, ...profile.scenarioThemeTags.slice(0, 3)] : profile.scenarioThemeTags.slice(0, 3)
  if (gameTags.length > 0) {
    groups.push({ label: '玩本偏好', tags: gameTags })
  }
  return groups
}

export function emptyMiniPartnerProfile(): MiniPartnerProfile {
  return {
    hobbyTags: [],
    gameTypePref: null,
    scenarioThemeTags: [],
    expressionStyleTags: [],
    groupRoleTags: [],
  }
}

export function asMiniStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
