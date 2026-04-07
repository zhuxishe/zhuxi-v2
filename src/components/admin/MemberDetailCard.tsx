import { TagBadge } from "@/components/shared/TagBadge"
import { PERSONALITY_DIMENSIONS } from "@/lib/constants/personality"
import { EvalTabView } from "./EvalTabView"
import type { MemberDetail, MemberIdentityRow } from "@/types"

interface Props { member: MemberDetail; identity: MemberIdentityRow | null }

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2 text-sm">{value ?? <span className="text-muted-foreground">-</span>}</td>
    </tr>
  )
}

function TagRow({ label, tags, variant }: { label: string; tags?: string[]; variant?: "info" | "success" | "danger" }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap align-top w-24">{label}</td>
      <td className="py-2">
        {tags?.length ? tags.map((t) => <TagBadge key={t} label={t} variant={variant} className="mr-1 mb-1" />) : <span className="text-sm text-muted-foreground">-</span>}
      </td>
    </tr>
  )
}

export function SectionHeader({ title, color = "primary" }: { title: string; color?: string }) {
  const colors: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  }
  return <div className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${colors[color] ?? colors.primary}`}>{title}</div>
}

export function MemberDetailCard({ member, identity }: Props) {
  if (!identity) return <p className="text-sm text-muted-foreground">无身份信息</p>

  const rawEvals = member.interview_evaluations
  const evals = Array.isArray(rawEvals) ? rawEvals : rawEvals ? [rawEvals] : []
  const lang = member.member_language
  const interests = member.member_interests
  const personality = member.member_personality
  const bounds = member.member_boundaries
  const verification = member.member_verification

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 divide-y divide-border">
      {/* 1. 基本信息 / 学业 / 标签 */}
      <div className="p-5 space-y-3">
        <SectionHeader title="基本信息" />
        <table className="w-full"><tbody>
          <Row label="姓名" value={identity.full_name} />
          <Row label="昵称" value={identity.nickname} />
          <Row label="性别" value={identity.gender} />
          <Row label="年龄段" value={identity.age_range} />
          <Row label="国籍" value={identity.nationality} />
          <Row label="所在地" value={identity.current_city} />
          <Row label="学校" value={identity.school_name} />
          <Row label="学部" value={identity.department} />
          <Row label="学位" value={identity.degree_level} />
          <Row label="入学年" value={identity.enrollment_year} />
          <TagRow label="爱好" tags={identity.hobby_tags} />
          <TagRow label="活动类型" tags={identity.activity_type_tags} variant="info" />
          <TagRow label="性格自评" tags={identity.personality_self_tags} variant="success" />
          <TagRow label="个人NG" tags={identity.taboo_tags} variant="danger" />
        </tbody></table>
      </div>

      {/* 2. 面试评估（支持多面试官 tab 切换） */}
      <div className="p-5 space-y-3">
        <SectionHeader title="面试评估" color="amber" />
        <EvalTabView evaluations={evals} />
      </div>

      {/* 3. 补充信息 */}
      <div className="p-5 space-y-3">
        <SectionHeader title="补充信息" color="violet" />
        {(!lang && !interests) ? <p className="text-sm text-muted-foreground">未填写</p> : (
          <table className="w-full"><tbody>
            {lang && <>
              <TagRow label="沟通语言" tags={lang.communication_language_pref} variant="info" />
              <Row label="日语水平" value={lang.japanese_level} />
            </>}
            {interests && <>
              <Row label="活动区域" value={interests.activity_area} />
              <Row label="最近车站" value={interests.nearest_station} />
              <Row label="理想人数" value={interests.ideal_group_size} />
              <Row label="活动频率" value={interests.activity_frequency} />
              <Row label="预算" value={interests.budget_range} />
              <Row label="移动范围" value={interests.travel_radius} />
              <Row label="主要目标" value={interests.social_goal_primary} />
              <Row label="次要目标" value={interests.social_goal_secondary} />
              <TagRow label="剧本类型" tags={interests.scenario_mode_pref} />
              <TagRow label="剧本偏好" tags={interests.script_preference} variant="info" />
              <TagRow label="非剧本" tags={interests.non_script_preference} variant="info" />
              <TagRow label="时间偏好" tags={interests.preferred_time_slots} variant="info" />
              <Row label="接受新手" value={interests.accept_beginners ? "是" : "否"} />
              <Row label="接受跨校" value={interests.accept_cross_school ? "是" : "否"} />
            </>}
          </tbody></table>
        )}
      </div>

      {/* 4. 性格评价 */}
      <div className="p-5 space-y-3">
        <SectionHeader title="性格评价" color="blue" />
        {!personality ? <p className="text-sm text-muted-foreground">未填写</p> : (
          <div className="space-y-2">
            {PERSONALITY_DIMENSIONS.map((dim) => {
              const val = personality[dim.key]
              if (val == null) return null
              if (dim.type === "slider") {
                const pct = ((Number(val) - 1) / 4) * 100
                return (
                  <div key={dim.key} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{dim.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium w-4 text-right">{val}</span>
                  </div>
                )
              }
              if (dim.type === "multi" && Array.isArray(val)) {
                return (
                  <div key={dim.key} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{dim.label}</span>
                    {val.map((t: string) => <TagBadge key={t} label={t} variant="info" className="mr-1" />)}
                  </div>
                )
              }
              return (
                <div key={dim.key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{dim.label}</span>
                  <span className="text-sm">{val}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 5. 个人边界 */}
      <div className="p-5 space-y-3">
        <SectionHeader title="个人边界" color="rose" />
        {!bounds ? <p className="text-sm text-muted-foreground">未填写</p> : (
          <table className="w-full"><tbody>
            <Row label="年龄范围" value={bounds.preferred_age_range} />
            <Row label="性别比例" value={bounds.preferred_gender_mix} />
            <TagRow label="禁忌" tags={bounds.taboo_tags} variant="danger" />
            <TagRow label="绝不接受" tags={bounds.deal_breakers} variant="danger" />
            {bounds.boundary_notes && <Row label="备注" value={bounds.boundary_notes} />}
          </tbody></table>
        )}
      </div>

      {/* 6. 验证状态 */}
      <div className="p-5 space-y-3">
        <SectionHeader title="验证状态" color="primary" />
        {!verification ? <p className="text-sm text-muted-foreground">未验证</p> : (
          <table className="w-full"><tbody>
            <Row label="学生证" value={verification.student_id_verified ? "已验证" : "未验证"} />
            <Row label="照片" value={verification.photo_verified ? "已验证" : "未验证"} />
            {verification.verified_at && <Row label="验证时间" value={verification.verified_at} />}
          </tbody></table>
        )}
      </div>
    </div>
  )
}
