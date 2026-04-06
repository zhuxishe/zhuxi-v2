import { TagBadge } from "@/components/shared/TagBadge"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { data: any }

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "-"}</dd>
    </div>
  )
}

export function MemberInterestsSection({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h3 className="text-sm font-semibold text-foreground mb-2">活动偏好</h3>
        <p className="text-sm text-muted-foreground">未填写</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">活动偏好</h3>
      <dl className="grid grid-cols-2 gap-3">
        <Field label="活动区域" value={data.activity_area} />
        <Field label="最近车站" value={data.nearest_station} />
        <Field label="理想人数" value={data.ideal_group_size} />
        <Field label="活动频率" value={data.activity_frequency} />
        <Field label="预算" value={data.budget_range} />
        <Field label="移动范围" value={data.travel_radius} />
      </dl>
      {data.scenario_mode_pref?.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground mr-2">剧本类型:</span>
          {data.scenario_mode_pref.map((t: string) => (
            <TagBadge key={t} label={t} className="mr-1 mb-1" />
          ))}
        </div>
      )}
      {data.preferred_time_slots?.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground mr-2">时间偏好:</span>
          {data.preferred_time_slots.map((t: string) => (
            <TagBadge key={t} label={t} variant="info" className="mr-1 mb-1" />
          ))}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-3">
        <Field label="主要社交目标" value={data.goal_primary} />
        <Field label="次要社交目标" value={data.goal_secondary} />
        <Field label="接受新手" value={data.accept_beginners ? "是" : "否"} />
        <Field label="接受跨校" value={data.accept_cross_school ? "是" : "否"} />
      </dl>
    </div>
  )
}
