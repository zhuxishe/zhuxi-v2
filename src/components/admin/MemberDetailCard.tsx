import { TagBadge } from "@/components/shared/TagBadge"
import { MemberLanguageSection } from "./MemberLanguageSection"
import { MemberInterestsSection } from "./MemberInterestsSection"
import { MemberPersonalitySection } from "./MemberPersonalitySection"
import { MemberBoundarySection } from "./MemberBoundarySection"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { member: any; identity: any }

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "-"}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}

export function MemberDetailCard({ member, identity }: Props) {
  if (!identity) return <p className="text-sm text-muted-foreground">无身份信息</p>

  const evaluation = member.interview_evaluations?.[0]

  return (
    <div className="space-y-4">
      {/* 1. 基本信息 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="基本信息">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="姓名" value={identity.full_name} />
            <Field label="昵称" value={identity.nickname} />
            <Field label="性别" value={identity.gender} />
            <Field label="年龄段" value={identity.age_range} />
            <Field label="国籍" value={identity.nationality} />
            <Field label="所在地" value={identity.current_city} />
          </dl>
        </Section>

        {/* 2. 学业信息 */}
        <Section title="学业信息">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="学校" value={identity.school_name} />
            <Field label="学部/研究科" value={identity.department} />
            <Field label="学位阶段" value={identity.degree_level} />
            <Field label="课程语言" value={identity.course_language} />
            <Field label="入学年份" value={identity.enrollment_year?.toString()} />
            <Field label="面试日期" value={member.interview_date} />
          </dl>
        </Section>
      </div>

      {/* 3. 标签信息 */}
      <Section title="标签信息">
        <div className="space-y-2">
          <TagRow label="爱好" tags={identity.hobby_tags} />
          <TagRow label="活动偏好" tags={identity.activity_type_tags} variant="info" />
          <TagRow label="性格" tags={identity.personality_self_tags} variant="success" />
          <TagRow label="禁忌" tags={identity.taboo_tags} variant="danger" />
        </div>
      </Section>

      {/* 4. 面试评估 */}
      {evaluation && (
        <Section title="面试评估">
          <dl className="grid grid-cols-3 gap-3">
            <Field label="面试官" value={evaluation.interviewer} />
            <Field label="吸引力评分" value={evaluation.attractiveness_score?.toString()} />
            <Field label="印象评分" value={evaluation.impression_score?.toString()} />
          </dl>
          {evaluation.notes && (
            <p className="text-sm text-muted-foreground mt-2">{evaluation.notes}</p>
          )}
        </Section>
      )}

      {/* 5-8. 补充信息区域 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MemberLanguageSection data={member.member_language} />
        <MemberInterestsSection data={member.member_interests} />
      </div>
      <MemberPersonalitySection data={member.member_personality} />
      <MemberBoundarySection data={member.member_boundaries} />
    </div>
  )
}

function TagRow({ label, tags, variant }: { label: string; tags?: string[]; variant?: "info" | "success" | "danger" }) {
  if (!tags?.length) return null
  return (
    <div>
      <span className="text-xs text-muted-foreground mr-2">{label}:</span>
      {tags.map((t: string) => <TagBadge key={t} label={t} variant={variant} className="mr-1 mb-1" />)}
    </div>
  )
}
