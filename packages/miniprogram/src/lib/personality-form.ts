import { MiniPersonalityFormData } from './personality'

type NullableMiniPersonalityFormInput = {
  [Key in keyof MiniPersonalityFormData]?: MiniPersonalityFormData[Key] | null
}

export const EMPTY_MINI_PERSONALITY: MiniPersonalityFormData = {
  extroversion: 3,
  initiative: 3,
  expression_style_tags: [],
  group_role_tags: [],
  warmup_speed: '',
  planning_style: '',
  coop_compete_tendency: '',
  emotional_stability: 3,
  boundary_strength: '',
  reply_speed: '',
}

export function buildMiniPersonalityForm(
  existing?: NullableMiniPersonalityFormInput | null
): MiniPersonalityFormData {
  const merged = {
    ...EMPTY_MINI_PERSONALITY,
    ...(existing ?? {}),
  }
  for (const key of Object.keys(EMPTY_MINI_PERSONALITY) as (keyof MiniPersonalityFormData)[]) {
    if (merged[key] == null) {
      ;(merged as Record<string, unknown>)[key] = EMPTY_MINI_PERSONALITY[key]
    }
  }
  return merged as MiniPersonalityFormData
}

export function isMiniPersonalityComplete(data: MiniPersonalityFormData) {
  return (
    data.extroversion > 0 &&
    data.initiative > 0 &&
    data.expression_style_tags.length > 0 &&
    data.group_role_tags.length > 0 &&
    !!data.warmup_speed &&
    !!data.planning_style &&
    !!data.coop_compete_tendency &&
    data.emotional_stability > 0 &&
    !!data.boundary_strength &&
    !!data.reply_speed
  )
}
