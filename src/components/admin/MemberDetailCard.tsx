import { TagBadge } from "@/components/shared/TagBadge"

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  member: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  identity: any
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "-"}</dd>
    </div>
  )
}

export function MemberDetailCard({ member, identity }: Props) {
  if (!identity) return <p className="text-sm text-muted-foreground">无身份信息</p>

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">基本信息</h3>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="姓名" value={identity.full_name} />
          <Field label="昵称" value={identity.nickname} />
          <Field label="性别" value={identity.gender === "male" ? "男" : identity.gender === "female" ? "女" : "其他"} />
          <Field label="年龄段" value={identity.age_range} />
          <Field label="国籍" value={identity.nationality} />
          <Field label="所在地" value={identity.current_city} />
        </dl>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">学业信息</h3>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="学校" value={identity.school_name} />
          <Field label="学部/研究科" value={identity.department} />
          <Field label="学位阶段" value={identity.degree_level} />
          <Field label="课程语言" value={identity.course_language} />
          <Field label="入学年份" value={identity.enrollment_year?.toString()} />
          <Field label="面试日期" value={member.interview_date} />
        </dl>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3 lg:col-span-2">
        <h3 className="text-sm font-semibold text-foreground">标签</h3>
        <div className="space-y-2">
          <div>
            <span className="text-xs text-muted-foreground mr-2">爱好:</span>
            {identity.hobby_tags?.map((t: string) => <TagBadge key={t} label={t} className="mr-1 mb-1" />)}
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-2">活动偏好:</span>
            {identity.activity_type_tags?.map((t: string) => <TagBadge key={t} label={t} variant="info" className="mr-1 mb-1" />)}
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-2">性格:</span>
            {identity.personality_self_tags?.map((t: string) => <TagBadge key={t} label={t} variant="success" className="mr-1 mb-1" />)}
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-2">禁忌:</span>
            {identity.taboo_tags?.map((t: string) => <TagBadge key={t} label={t} variant="danger" className="mr-1 mb-1" />)}
          </div>
        </div>
      </div>
    </div>
  )
}
