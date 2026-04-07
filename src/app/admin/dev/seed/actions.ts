"use server"

import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  FAKE_NAMES, FAKE_SCHOOLS, FAKE_DEPARTMENTS,
  GENDER_OPTIONS, AGE_RANGE_OPTIONS, NATIONALITY_OPTIONS,
  CITY_OPTIONS, HOBBY_TAGS, ACTIVITY_TYPE_TAGS,
  PERSONALITY_SELF_TAGS, TABOO_TAGS,
  EXPRESSION_STYLE_TAGS, GROUP_ROLE_TAGS, WARMUP_SPEED_OPTIONS,
  SCENARIO_MODE_OPTIONS, GAME_TYPE_PREF_OPTIONS, GENDER_PREF_OPTIONS,
  INTEREST_TAGS, ACTIVITY_AREA_OPTIONS, TIME_SLOT_OPTIONS,
  pick, pickN, randInt,
} from "@/lib/dev/fake-data"

interface SeedResult {
  success?: boolean
  error?: string
  membersCreated?: number
  roundId?: string
}

export async function generateTestData(count: number): Promise<SeedResult> {
  await requireAdmin()

  if (count < 1 || count > 100) return { error: "数量需在 1-100 之间" }

  const db = createAdminClient()
  const memberIds: string[] = []

  try {
    // 1. Create members
    for (let i = 0; i < count; i++) {
      const name = pick(FAKE_NAMES)
      const email = `test_${Date.now()}_${i}@fake.local`

      const { data: member, error } = await db
        .from("members")
        .insert({ status: "approved", email, membership_type: "player" })
        .select("id")
        .single()

      if (error) return { error: `创建成员失败: ${error.message}` }
      memberIds.push(member.id)

      // 2. Insert associated records in parallel
      await Promise.all([
        insertIdentity(db, member.id, name),
        insertInterests(db, member.id),
        insertPersonality(db, member.id),
        insertBoundaries(db, member.id),
      ])
    }

    // 3. Create test round
    const now = new Date()
    const surveyEnd = new Date(now.getTime() + 7 * 86400000)
    const actEnd = new Date(now.getTime() + 21 * 86400000)

    const { data: round, error: roundErr } = await db
      .from("match_rounds")
      .insert({
        round_name: `测试轮次 - ${now.toISOString().slice(0, 16)}`,
        survey_start: now.toISOString(),
        survey_end: surveyEnd.toISOString(),
        activity_start: surveyEnd.toISOString().slice(0, 10),
        activity_end: actEnd.toISOString().slice(0, 10),
        status: "open",
      })
      .select("id")
      .single()

    if (roundErr) return { error: `创建轮次失败: ${roundErr.message}` }

    // 4. Create submissions for each member
    const submissions = memberIds.map((mid) => buildSubmission(round.id, mid))
    const { error: subErr } = await db
      .from("match_round_submissions")
      .insert(submissions)

    if (subErr) return { error: `创建问卷失败: ${subErr.message}` }

    return { success: true, membersCreated: count, roundId: round.id }
  } catch (e) {
    return { error: `未知错误: ${e instanceof Error ? e.message : e}` }
  }
}

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertIdentity(db: any, memberId: string, name: string) {
  return db.from("member_identity").insert({
    member_id: memberId,
    full_name: name,
    gender: pick(GENDER_OPTIONS),
    age_range: pick(AGE_RANGE_OPTIONS),
    nationality: pick(NATIONALITY_OPTIONS),
    current_city: pick(CITY_OPTIONS),
    school_name: pick(FAKE_SCHOOLS),
    department: pick(FAKE_DEPARTMENTS),
    hobby_tags: pickN(HOBBY_TAGS, randInt(2, 5)),
    activity_type_tags: pickN(ACTIVITY_TYPE_TAGS, randInt(2, 4)),
    personality_self_tags: pickN(PERSONALITY_SELF_TAGS, randInt(1, 3)),
    taboo_tags: pickN(TABOO_TAGS, randInt(0, 2)),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertInterests(db: any, memberId: string) {
  return db.from("member_interests").insert({
    member_id: memberId,
    activity_area: pick(ACTIVITY_AREA_OPTIONS),
    scenario_mode_pref: pickN(SCENARIO_MODE_OPTIONS, randInt(1, 3)),
    preferred_time_slots: pickN(TIME_SLOT_OPTIONS, randInt(2, 4)),
    accept_beginners: Math.random() > 0.2,
    accept_cross_school: Math.random() > 0.3,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertPersonality(db: any, memberId: string) {
  return db.from("member_personality").insert({
    member_id: memberId,
    extroversion: randInt(1, 5),
    initiative: randInt(1, 5),
    emotional_stability: randInt(2, 5),
    expression_style_tags: pickN(EXPRESSION_STYLE_TAGS, randInt(1, 3)),
    group_role_tags: pickN(GROUP_ROLE_TAGS, randInt(1, 2)),
    warmup_speed: pick(WARMUP_SPEED_OPTIONS),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function insertBoundaries(db: any, memberId: string) {
  return db.from("member_boundaries").insert({
    member_id: memberId,
    taboo_tags: pickN(TABOO_TAGS, randInt(0, 3)),
  })
}

function buildSubmission(roundId: string, memberId: string) {
  // Generate random availability: some days with time slots
  const days = ["2026-04-15", "2026-04-16", "2026-04-19", "2026-04-20"]
  const avail: Record<string, string[]> = {}
  for (const d of pickN(days, randInt(1, 3))) {
    avail[d] = pickN(TIME_SLOT_OPTIONS, randInt(1, 3))
  }

  return {
    round_id: roundId,
    member_id: memberId,
    game_type_pref: pick(GAME_TYPE_PREF_OPTIONS),
    gender_pref: pick(GENDER_PREF_OPTIONS),
    availability: avail,
    interest_tags: pickN(INTEREST_TAGS, randInt(2, 4)),
  }
}
