import type { AdminRole, MemberCenterRecord } from "@/types"

export const MEMBER_360_TABS = [
  { value: "overview", label: "概览 / Overview" },
  { value: "profile", label: "资料 / Profile" },
  { value: "application", label: "申请 / Application" },
  { value: "activity", label: "活动与匹配 / Activity & Matching" },
  { value: "community", label: "社区与反馈 / Community & Feedback" },
  { value: "audit", label: "审计 / Audit" },
] as const

export type Member360Tab = (typeof MEMBER_360_TABS)[number]["value"]

const FIELD_LABELS: Record<string, string> = {
  id: "记录 ID",
  member_id: "成员 ID",
  member_id_snapshot: "成员 ID 快照",
  member_number: "会员编号",
  full_name: "姓名",
  nickname: "昵称",
  email: "邮箱",
  gender: "性别",
  age_range: "年龄段",
  nationality: "国籍",
  current_city: "当前城市",
  school_name: "学校",
  department: "学部 / 专业",
  degree_level: "学位",
  course_language: "授课语言",
  enrollment_year: "入学年",
  height_weight: "身高 / 体重",
  phone: "电话",
  sns_accounts: "社交账号",
  personal_avatar_path: "个人头像路径",
  avatar_url: "头像",
  avatar_path: "头像路径",
  hobby_tags: "兴趣标签",
  activity_type_tags: "活动类型",
  personality_self_tags: "性格自评",
  taboo_tags: "禁忌标签",
  communication_language_pref: "沟通语言",
  japanese_level: "日语水平",
  activity_area: "活动区域",
  nearest_station: "最近车站",
  graduation_year: "毕业年",
  game_type_pref: "游戏类型偏好",
  scenario_mode_pref: "剧本模式偏好",
  scenario_theme_tags: "剧本主题",
  ideal_group_size: "理想人数",
  script_preference: "剧本偏好",
  non_script_preference: "非剧本偏好",
  activity_frequency: "活动频率",
  preferred_time_slots: "时间偏好",
  budget_range: "预算范围",
  travel_radius: "移动范围",
  social_goal_primary: "主要社交目标",
  social_goal_secondary: "次要社交目标",
  accept_beginners: "接受新手",
  accept_cross_school: "接受跨校",
  extroversion: "外向程度",
  initiative: "主动程度",
  expression_style_tags: "表达风格",
  group_role_tags: "小组角色",
  warmup_speed: "熟悉速度",
  planning_style: "计划风格",
  coop_compete_tendency: "合作 / 竞争倾向",
  emotional_stability: "情绪稳定度",
  boundary_strength: "边界强度",
  reply_speed: "回复速度",
  preferred_age_range: "偏好年龄范围",
  preferred_gender_mix: "偏好性别构成",
  deal_breakers: "绝不接受",
  boundary_notes: "边界备注",
  student_id_verified: "学生证核验",
  photo_verified: "照片核验",
  verified_at: "核验时间",
  verified_by: "核验人",
  preferences: "社区通知偏好",
  likes_enabled: "点赞通知",
  comments_enabled: "评论通知",
  replies_enabled: "回复通知",
  announcements_enabled: "公告通知",
  answers: "测试原始答案",
  personality_type: "人格类型",
  completed_at: "测试完成时间",
  created_at: "创建时间",
  updated_at: "更新时间",
}

export function normalizeMember360Tab(value: string | null | undefined): Member360Tab {
  return MEMBER_360_TABS.some((tab) => tab.value === value)
    ? value as Member360Tab
    : "overview"
}

export function parseMemberDirectoryPage(value: string | null | undefined): number {
  if (!value) return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function buildMemberDirectoryUrl(
  current: URLSearchParams | string,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(typeof current === "string" ? current : current.toString())
  const normalized = value.trim()
  if (normalized && normalized !== "all") params.set(key, normalized)
  else params.delete(key)
  if (key !== "page") params.delete("page")
  const query = params.toString()
  return query ? `/admin/members?${query}` : "/admin/members"
}

export function canRestoreMemberAudit(role: AdminRole, rpcCapability: boolean): boolean {
  return role === "super_admin" && rpcCapability
}

export function memberLifecycleAvailability(accountStatus: string | null, anonymizedAt: string | null) {
  return {
    canSuspend: accountStatus === "active",
    canReactivate: accountStatus === "suspended",
    canClose: accountStatus !== "closed",
    canAnonymize: anonymizedAt === null,
  }
}

export function memberFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replaceAll("_", " ")
}

export function formatMemberValue(value: unknown): string {
  if (value === null || value === undefined) return "未填写（null）"
  if (value === true) return "是（true）"
  if (value === false) return "否（false）"
  if (Array.isArray(value)) return value.length > 0 ? value.map(formatCompactValue).join("、") : "空数组（[]）"
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  if (value === "") return "空字符串（\"\"）"
  return String(value)
}

function formatCompactValue(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function memberRecordEntries(record: MemberCenterRecord | null) {
  if (!record) return []
  return Object.entries(record)
}
