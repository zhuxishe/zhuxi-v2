"use server"

import { revalidatePath } from "next/cache"
import { isLinkableSignupRound } from "@/lib/activity-registration-links/eligibility"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { requireAdmin } from "@/lib/auth/admin"
import { getSurveyWindowState, type SurveyWindowState } from "@/lib/matching/survey-window"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/types/database.types"

export type ActivityRegistrationLinkTarget = { largeActivityId: string } | { roundId: string }

type ActivityRegistrationLinkItem = { id: string; title: string; archived?: boolean }
type ActivityRegistrationLinkOption = ActivityRegistrationLinkItem & { detail?: string; linkedTo?: string }
type LoadResult = {
  current?: ActivityRegistrationLinkItem | null
  options?: ActivityRegistrationLinkOption[]
  error?: string
}

type LinkableRound = Pick<Tables<"match_rounds">, "id" | "round_name" | "status" | "purpose" | "is_test" | "deleted_at" | "survey_start" | "survey_end">
type LinkableActivity = Pick<Tables<"past_event_reviews">, "id" | "title" | "status" | "archived_at" | "registration_round_id">

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const ROUND_STATES: Record<SurveyWindowState, string> = {
  draft: "草稿",
  scheduled: "即将开放",
  open: "报名开放",
  expired: "报名已截止",
  closed: "报名已关闭",
  matched: "已完成匹配",
  invalid: "报名时间有误",
}
const ACTIVITY_STATES: Record<string, string> = { draft: "草稿", published: "已发布", cancelled: "已取消" }
const BATCH_SIZE = 500

function validUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_PATTERN.test(id)
}

function resolveTarget(target: ActivityRegistrationLinkTarget) {
  if (!target || typeof target !== "object") return null
  if ("largeActivityId" in target && !("roundId" in target) && validUuid(target.largeActivityId)) {
    return { activityId: target.largeActivityId.toLowerCase(), roundId: null }
  }
  if ("roundId" in target && !("largeActivityId" in target) && validUuid(target.roundId)) {
    return { activityId: null, roundId: target.roundId.toLowerCase() }
  }
  return null
}

function roundTitle(round: LinkableRound) {
  return round.deleted_at ? `${round.round_name}（已删除）` : round.round_name
}

function activityTitle(activity: LinkableActivity) {
  return activity.archived_at ? `${activity.title}（已归档）` : activity.title
}

async function readRows<T>(loadPage: (first: number, last: number) => PromiseLike<{
  data: T[] | null
  error: { code?: string; message: string } | null
}>) {
  const rows: T[] = []
  for (let start = 0; ; start += BATCH_SIZE) {
    const { data, error } = await loadPage(start, start + BATCH_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < BATCH_SIZE) return rows
  }
}

function linkError(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown }
    if (["42703", "PGRST204", "PGRST202", "42883"].includes(String(code))) return "报名关联暂未启用"
    if (code === "23505" || String(message).includes("ACTIVITY_REGISTRATION_ALREADY_LINKED")) return "对方已关联其他活动，请先解除原关联"
    if (code === "23503" || String(message).includes("ACTIVITY_REGISTRATION_ROUND_UNAVAILABLE")) return "请选择已发布且可收报名的正式轮次"
    if (String(message).includes("ACTIVITY_REGISTRATION_LINK_CHANGED")) return "关联已变更，请关闭窗口后重新打开核对"
    if (String(message).includes("ACTIVITY_REGISTRATION_ARCHIVED_ACTIVITY")) return "请先恢复已归档的大型活动，再修改它的关联"
    if (String(message).includes("ACTIVITY_REGISTRATION_ACTIVITY_UNAVAILABLE")) return "大型活动不存在或已归档"
    if (code === "42501") return "当前账号没有修改活动关联的权限"
  }
  console.error("[activity-registration-link]", error)
  return fallback
}

export async function loadActivityRegistrationLinkOptions(target: ActivityRegistrationLinkTarget): Promise<LoadResult> {
  await requireAdmin()
  const source = resolveTarget(target)
  if (!source) return { error: "活动标识无效" }

  const db = createAdminClient()
  try {
    const [activities, rounds] = await Promise.all([
      readRows<LinkableActivity>((first, last) => db.from("past_event_reviews")
        .select("id,title,status,archived_at,registration_round_id")
        .order("id").range(first, last)),
      readRows<LinkableRound>((first, last) => db.from("match_rounds")
        .select("id,round_name,status,purpose,is_test,deleted_at,survey_start,survey_end")
        .order("activity_start", { ascending: false }).order("id").range(first, last)),
    ])
    const roundsById = new Map(rounds.map((round) => [round.id, round]))
    if (source.activityId) {
      const targetActivity = activities.find((activity) => activity.id === source.activityId)
      if (!targetActivity || targetActivity.archived_at) return { error: "大型活动不存在或已归档" }
      const currentRound = targetActivity.registration_round_id ? roundsById.get(targetActivity.registration_round_id) : null
      const linkedActivities = new Map(activities
        .filter((activity) => activity.id !== source.activityId && activity.registration_round_id)
        .map((activity) => [activity.registration_round_id, activityTitle(activity)]))
      const now = new Date()
      return {
        current: currentRound ? { id: currentRound.id, title: roundTitle(currentRound), archived: Boolean(currentRound.deleted_at) } : null,
        options: rounds.filter(isLinkableSignupRound).map((round) => ({
          id: round.id,
          title: round.round_name,
          detail: `${round.purpose === "registration" ? "固定时间活动报名" : "收集时间后匹配"} · ${ROUND_STATES[getSurveyWindowState(round, now)]} · 截止 ${formatAdminDateTime(round.survey_end)}`,
          linkedTo: linkedActivities.get(round.id),
        })),
      }
    }

    const targetRound = source.roundId ? roundsById.get(source.roundId) : null
    if (!targetRound || targetRound.deleted_at || targetRound.is_test) return { error: "轮次不可关联或已删除" }
    const currentActivity = activities.find((activity) => activity.registration_round_id === targetRound.id)
    const eligible = isLinkableSignupRound(targetRound)
    if (!eligible && !currentActivity) return { error: "请选择已发布且可收报名的正式轮次" }
    return {
      current: currentActivity ? { id: currentActivity.id, title: activityTitle(currentActivity), archived: Boolean(currentActivity.archived_at) } : null,
      options: eligible ? activities.filter((activity) => activity.archived_at === null).map((activity) => ({
        id: activity.id,
        title: activity.title,
        detail: ACTIVITY_STATES[activity.status],
        linkedTo: activity.registration_round_id && activity.registration_round_id !== targetRound.id
          ? roundsById.get(activity.registration_round_id)?.round_name ?? "其他轮次"
          : undefined,
      })) : [],
    }
  } catch (error) {
    return { error: linkError(error, "无法读取活动关联，请稍后重试") }
  }
}

export async function saveActivityRegistrationLink(input: {
  target: ActivityRegistrationLinkTarget
  counterpartId: string | null
  expectedCounterpartId: string | null
}): Promise<{ error?: string; success?: boolean }> {
  await requireAdmin()
  const source = resolveTarget(input?.target)
  if (!source || (input.counterpartId !== null && !validUuid(input.counterpartId))
    || (input.expectedCounterpartId !== null && !validUuid(input.expectedCounterpartId))) {
    return { error: "活动标识无效" }
  }

  const db = await createClient()
  const { data, error } = await db.rpc("admin_set_large_activity_registration_link", {
    p_activity_id: source.activityId,
    p_round_id: source.roundId,
    p_counterpart_id: input.counterpartId,
    p_expected_counterpart_id: input.expectedCounterpartId,
  })
  if (error) return { error: linkError(error, "保存活动关联失败，请稍后重试") }
  const changed = data?.[0]
  if (!changed) return { error: "无法确认关联状态，请刷新后重试" }

  const paths = new Set([
    "/admin/reviews",
    "/admin/matching",
    "/app/scripts",
    "/app/scripts/large",
    ...changed.round_ids.map((id) => `/admin/matching/rounds/${id}`),
    ...changed.activity_ids.map((id) => `/app/scripts/large/${id}`),
  ])
  for (const path of paths) revalidatePath(path)
  return { success: true }
}
