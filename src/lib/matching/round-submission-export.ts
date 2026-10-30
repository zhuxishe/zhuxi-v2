import type { RoundContentConfig, RoundPurpose, RoundQuestion } from "@/types"

const submissionTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
})

function submissionTime(value: unknown): string {
  // Database timestamps include an offset; never interpret missing zones using
  // the exporting administrator's browser timezone.
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return ""
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const parts = new Map(submissionTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")} ${parts.get("hour")}:${parts.get("minute")}:${parts.get("second")}`
}

export function submissionIdentity(submission: Record<string, any>) {
  const member = Array.isArray(submission.member) ? submission.member[0] : submission.member
  const identity = Array.isArray(member?.member_identity) ? member.member_identity[0] : member?.member_identity
  return { name: identity?.full_name || identity?.nickname || "未知", school: identity?.school_name || "" }
}

export function customAnswerText(question: RoundQuestion, answer: unknown) {
  if (typeof answer !== "string" && !Array.isArray(answer)) return ""
  const values = Array.isArray(answer) ? answer.filter((value): value is string => typeof value === "string") : [answer]
  return values.map((value) => question.options.find((option) => option.id === value)?.label.zh || value).join("、")
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value)
  const safe = /^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function buildRoundSubmissionCsv(submissions: Record<string, any>[], config: RoundContentConfig, purpose: RoundPurpose) {
  const matching = purpose === "matching"
  const registration = purpose === "registration"
  const headers = [matching ? "成员编号" : "成员 ID", "姓名", "学校", "提交时间", ...(registration ? ["报名状态", "取消时间"] : []), ...(matching ? ["游戏类型", "搭档性别偏好", "可用时间", "兴趣题材", "社交风格", "留言"] : []), ...config.questions.map((question) => question.label.zh)]
  const rows = submissions.map((submission) => {
    const identity = submissionIdentity(submission)
    const member = Array.isArray(submission.member) ? submission.member[0] : submission.member
    const memberNumber = typeof member?.member_number === "string" ? member.member_number : ""
    return [matching ? memberNumber : submission.member_id, identity.name, identity.school, matching ? submissionTime(submission.created_at) : submission.created_at,
      ...(registration ? [submission.cancelled_at ? "已取消" : "有效报名", submission.cancelled_at ?? ""] : []),
      ...(matching ? [submission.game_type_pref, submission.gender_pref, JSON.stringify(submission.availability ?? {}), (submission.interest_tags ?? []).join("、"), submission.social_style, submission.message] : []),
      ...config.questions.map((question) => customAnswerText(question, submission.custom_answers?.[question.id])),
    ]
  })
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
}
