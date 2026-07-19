"use server"

import { requirePlayer } from "@/lib/auth/player"
import { createAdminClient } from "@/lib/supabase/admin"
import { PLAYER_FEEDBACK_CATEGORIES } from "@/types/player-feedback"
import type { PlayerFeedbackActionState } from "@/types/player-feedback"

export type { PlayerFeedbackActionState } from "@/types/player-feedback"

function value(formData: FormData, key: string) {
  const entry = formData.get(key)
  return typeof entry === "string" ? entry : ""
}

function characterCount(input: string) {
  return Array.from(input).length
}

function normalizePagePath(input: string) {
  const path = input.trim()
  const isPlayerPath = path === "/app" || path.startsWith("/app/")
  return isPlayerPath && path.length <= 500 ? path : "/app"
}

export async function submitPlayerFeedbackAction(
  _previousState: PlayerFeedbackActionState,
  formData: FormData,
): Promise<PlayerFeedbackActionState> {
  const player = await requirePlayer()
  const isJapanese = value(formData, "locale") === "ja"
  const copy = (zh: string, ja: string) => isJapanese ? ja : zh
  const category = value(formData, "category")
  const content = value(formData, "content").trim()
  const submissionId = value(formData, "submissionId")
  const fieldErrors: PlayerFeedbackActionState["fieldErrors"] = {}

  if (!PLAYER_FEEDBACK_CATEGORIES.some((item) => item === category)) {
    fieldErrors.category = copy("请选择反馈类型", "フィードバックの種類を選択してください")
  }
  const contentLength = characterCount(content)
  if (contentLength < 10) fieldErrors.content = copy("请至少填写 10 个字", "10文字以上入力してください")
  if (contentLength > 500) fieldErrors.content = copy("反馈内容不能超过 500 个字", "500文字以内で入力してください")
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    return { error: copy("提交信息已失效，请关闭窗口后重试", "送信情報の有効期限が切れました。画面を閉じてもう一度お試しください") }
  }
  if (fieldErrors.category || fieldErrors.content) {
    return { error: copy("请检查填写内容", "入力内容を確認してください"), fieldErrors }
  }

  const supabase = createAdminClient()
  const { data: identity, error: identityError } = await supabase
    .from("member_identity")
    .select("full_name")
    .eq("member_id", player.memberId)
    .maybeSingle()
  if (identityError) {
    console.error("[submitPlayerFeedbackAction] identity lookup", identityError)
    return { error: copy("暂时无法读取个人资料，请稍后重试", "プロフィールを読み込めませんでした。時間をおいてもう一度お試しください") }
  }
  const realName = identity?.full_name?.trim()
  if (!realName) {
    return { error: copy("未找到实名信息，请先完善个人资料", "本人情報が見つかりません。先にプロフィールを完成してください") }
  }

  const { error } = await supabase.from("player_feedback").insert({
    member_id: player.memberId,
    member_name_snapshot: realName,
    client_submission_id: submissionId,
    category,
    content,
    page_path: normalizePagePath(value(formData, "pagePath")),
    locale: isJapanese ? "ja" : "zh",
  })
  if (error) {
    if (error.code === "23505") return { success: true }
    if (error.message?.includes("player_feedback_rate_limited")) {
      return { error: copy("提交得有点快，请稍等 10 秒再试", "送信間隔が短すぎます。10秒ほど待ってからお試しください") }
    }
    console.error("[submitPlayerFeedbackAction] insert", error)
    return { error: copy("提交失败，请稍后重试", "送信できませんでした。時間をおいてもう一度お試しください") }
  }
  return { success: true }
}
