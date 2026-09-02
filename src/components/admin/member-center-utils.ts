import type { AdminRole, MemberCenterRecord } from "@/types"

export const MEMBER_360_TABS = [
  { value: "overview", label: "概览" },
  { value: "profile", label: "个人资料" },
  { value: "application", label: "申请与核验" },
  { value: "activity", label: "活动与匹配" },
  { value: "community", label: "社区与反馈" },
  { value: "audit", label: "变更审计" },
] as const

export type Member360Tab = (typeof MEMBER_360_TABS)[number]["value"]

const FIELD_LABELS: Record<string, string> = {
  id: "记录 ID",
  member_id: "成员 ID",
  member_id_snapshot: "成员 ID 快照",
  member_number: "会员编号",
  member_no: "历史会员编号",
  user_id: "登录账号 ID",
  canonical_member_id: "成员主记录 ID",
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
  status: "状态",
  member_status: "审批状态",
  account_status: "账号状态",
  auth_bound: "是否绑定登录账号",
  auth_email: "登录邮箱",
  auth_providers: "登录方式",
  auth_created_at: "登录账号创建时间",
  auth_last_sign_in_at: "最近登录时间",
  account_linked_at: "账号绑定时间",
  anonymized_at: "匿名化时间",
  line_user_id: "LINE 用户 ID",
  wechat_openid: "微信 OpenID",
  record_source: "记录来源",
  record_scope: "记录范围",
  profile_stage: "资料阶段",
  onboarding_step: "资料填写步骤",
  last_profile_saved_at: "最近保存资料时间",
  submitted_at: "提交时间",
  membership_type: "会员类型",
  interview_date: "面试日期",
  interviewer: "面试负责人",
  attractiveness_score: "综合吸引力评分",
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
  score_e: "外向性得分（E）",
  score_a: "宜人性得分（A）",
  score_o: "开放性得分（O）",
  score_c: "尽责性得分（C）",
  score_n: "情绪敏感度得分（N）",
  completed_at: "测试完成时间",
  activity_count: "参加活动次数",
  review_count: "互评数量",
  avg_review_score: "平均互评分数",
  recent5_avg_score: "最近五次平均分",
  reliability_score: "可靠度评分",
  replay_willing_rate: "再次组队意愿率",
  complaint_count: "投诉次数",
  late_count: "迟到次数",
  no_show_count: "缺席次数",
  last_activity_at: "最近活动时间",
  member_level: "会员等级",
  compatibility_score: "合拍分数",
  compatibility_status: "合拍分数状态",
  internal_note: "内部备注",
  score_source: "分数来源",
  published_at: "发布时间",
  published_by: "发布人",
  updated_by: "更新人",
  round_id: "匹配轮次 ID",
  session_id: "匹配场次 ID",
  activity_id: "活动 ID",
  script_id: "剧本 ID",
  availability: "可参加时段",
  gender_pref: "性别构成偏好",
  interest_tags: "兴趣标签",
  social_style: "社交风格",
  message: "留言",
  import_metadata: "导入信息",
  raw_payload: "原始导入数据",
  can_view_full: "可查看完整内容",
  played_at: "参与时间",
  rating: "评分",
  comment: "评论",
  details: "诊断详情",
  reason: "原因",
  role_key: "角色",
  active: "是否有效",
  assigned_at: "分配时间",
  assigned_by: "分配人",
  assigned_by_snapshot: "分配人快照",
  revoked_at: "撤销时间",
  revoked_by: "撤销人",
  revoked_by_snapshot: "撤销人快照",
  source: "来源",
  actor_name: "操作人",
  actor_user_id: "操作人登录账号 ID",
  action_type: "操作类型",
  section: "资料分区",
  changed_fields: "变更字段",
  before_values: "修改前内容",
  after_values: "修改后内容",
  restored_from_event_id: "来源审计记录 ID",
  profile_id: "社区资料 ID",
  avatar_kind: "头像类型",
  preset_avatar: "预设头像",
  joined_at: "加入社区时间",
  non_anonymous_post_count: "实名动态数",
  non_anonymous_comment_count: "实名评论数",
  total: "总数",
  pending: "待处理数量",
  latest: "最近记录",
  match_count: "匹配次数",
  reviews_written: "已填写互评",
  reviews_received: "收到互评",
  latest_matches: "最近匹配",
  latest_reviews: "最近互评",
  articulation: "表达清晰度",
  boundary_respect: "边界尊重度",
  communication: "沟通能力",
  enthusiasm: "积极程度",
  first_impression: "第一印象",
  humor: "幽默感",
  interest_alignment: "兴趣契合度",
  interviewer_id: "面试负责人 ID",
  interviewer_name: "面试负责人",
  interviewer_notes: "面试备注",
  japanese_ability: "日语能力",
  leadership_potential: "领导潜力",
  openness: "开放程度",
  overall_recommendation: "综合推荐度",
  responsibility: "责任感",
  risk_level: "风险等级",
  risk_notes: "风险备注",
  sincerity: "真诚度",
  social_comfort: "社交舒适度",
  team_orientation: "团队倾向",
  time_commitment: "时间投入度",
  school: "学校",
  game_mode: "游戏模式",
  social_tags: "社交标签",
  session_count: "参加次数",
  claim_status: "认领状态",
  claimed_at: "认领时间",
  reviewed_at: "审核时间",
  match_history: "历史匹配记录",
  intro: "个人介绍",
  major: "专业",
  is_published: "是否发布",
  sort_order: "显示顺序",
  created_at: "创建时间",
  updated_at: "更新时间",
}

const MEMBER_VALUE_LABELS: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
  pending: "待处理",
  approved: "已通过",
  rejected: "已拒绝",
  inactive: "已停用",
  active: "正常",
  unbound: "未绑定",
  suspended: "已暂停",
  closed: "已关闭",
  not_started: "未开始",
  in_progress: "填写中",
  submitted: "已提交",
  complete: "已完成",
  app: "玩家端登记",
  line: "LINE",
  legacy: "历史记录",
  import: "批量导入",
  admin: "后台建立",
  current: "当前记录",
  historical: "旧记录",
  player: "玩家",
  user: "普通成员",
  staff: "团队成员",
  super_admin: "超级管理员",
  volunteer: "志愿者",
  community_moderator: "社区管理员",
  operations: "运营",
  draft: "草稿",
  open: "开放中",
  matched: "已完成匹配",
  locked: "已锁定",
  cancelled: "已取消",
  confirmed: "已确认",
  confirmed_duplicate: "已确认重复",
  not_duplicate: "已确认非重复",
  merged: "已合并",
  published: "已发布",
  unclaimed: "未认领",
  low: "低",
  medium: "中",
  high: "高",
  resolved: "已处理",
  dismissed: "已驳回",
  harassment: "骚扰或攻击",
  privacy: "隐私或肖像问题",
  spam: "垃圾内容",
  inappropriate: "不适当内容",
  initial: "初始计算",
  manual: "人工调整",
  INSERT: "新增",
  UPDATE: "修改",
  DELETE: "删除",
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  member_change: "成员资料变更",
  member_created: "建立成员记录",
  admin_section_update: "管理员修改资料",
  admin_restore: "恢复历史版本",
  profile_update: "更新个人资料",
  metrics_update: "更新个人指标",
  activity_recalculate: "重算活动统计",
  member_lifecycle_update: "更新账号生命周期",
  member_anonymized: "匿名化成员资料",
  member_hard_deleted: "永久删除成员",
  role_assignment_update: "更新成员角色",
  duplicate_resolution: "处理重复记录",
  legacy_claim: "认领历史记录",
  member_import_event: "导入成员资料",
  admin_whitelist_created: "新增管理员",
  admin_role_updated: "修改管理员角色",
  admin_user_deleted: "删除管理员",
}

const AUDIT_SECTION_LABELS: Record<string, string> = {
  member: "成员主档",
  account: "登录账号",
  identity: "基本与学业信息",
  language: "语言信息",
  interests: "兴趣与活动偏好",
  personality: "性格自评",
  boundaries: "个人边界",
  quiz: "人格测试",
  application: "申请流程",
  verification: "身份核验",
  interview_evaluation: "面试评估",
  roles: "成员角色",
  workflow: "资料流程",
  lifecycle: "账号生命周期",
  import: "数据导入",
  related_legacy_members: "历史来源记录",
  related_match_round_submissions: "匹配问卷",
  staff_profile: "团队成员公开资料",
  profile_metrics: "个人主页指标",
  dynamic_stats: "活动统计",
  duplicate_resolution: "重复记录处理",
  anonymous_reveal: "匿名内容核验",
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

export function hasRestorableMemberAuditSnapshot(value: unknown): value is MemberCenterRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0)
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
  return FIELD_LABELS[key] ?? key
}

export function memberDisplayLabel(value: string): string {
  return MEMBER_VALUE_LABELS[value] ?? value
}

export function memberAuditActionLabel(value: string): string {
  return AUDIT_ACTION_LABELS[value] ?? memberDisplayLabel(value)
}

export function memberAuditSectionLabel(value: string): string {
  return AUDIT_SECTION_LABELS[value] ?? memberFieldLabel(value)
}

const DISPLAY_ENUM_FIELDS = new Set([
  "gender",
  "status",
  "member_status",
  "account_status",
  "record_source",
  "record_scope",
  "profile_stage",
  "onboarding_step",
  "role_key",
  "claim_status",
  "compatibility_status",
  "score_source",
  "risk_level",
])

export function formatMemberValue(value: unknown, field?: string): string {
  if (value === null || value === undefined) return "未填写"
  if (value === true) return "是"
  if (value === false) return "否"
  if (Array.isArray(value)) {
    if (value.length === 0) return "空列表"
    if (field === "changed_fields") {
      return value.map((item) => typeof item === "string" ? memberFieldLabel(item) : formatCompactValue(item)).join("、")
    }
    return value.map(formatCompactValue).join("、")
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  if (value === "") return "空文本"
  if (typeof value !== "string") return String(value)
  if (field === "action_type" || field === "action" || field === "operation") return memberAuditActionLabel(value)
  if (field === "section") return memberAuditSectionLabel(value)
  if (field === "member_status" && value === "pending") return "待面试"
  if (field === "claim_status" && value === "pending") return "待审核"
  return field && DISPLAY_ENUM_FIELDS.has(field) ? memberDisplayLabel(value) : value
}

function formatCompactValue(value: unknown): string {
  if (value === null) return "未填写"
  if (value === true) return "是"
  if (value === false) return "否"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function memberRecordEntries(record: MemberCenterRecord | null) {
  if (!record) return []
  return Object.entries(record)
}
