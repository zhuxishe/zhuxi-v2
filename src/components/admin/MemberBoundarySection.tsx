import { TagBadge } from "@/components/shared/TagBadge"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { data: any }

export function MemberBoundarySection({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h3 className="text-sm font-semibold text-foreground mb-2">个人边界</h3>
        <p className="text-sm text-muted-foreground">未填写（仅管理员可编辑）</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">个人边界</h3>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">理想年龄范围</dt>
          <dd className="text-sm font-medium">{data.preferred_age_range || "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">性别比例偏好</dt>
          <dd className="text-sm font-medium">{data.preferred_gender_mix || "-"}</dd>
        </div>
      </dl>
      {data.taboo_tags?.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground mr-2">禁忌:</span>
          {data.taboo_tags.map((t: string) => (
            <TagBadge key={t} label={t} variant="danger" className="mr-1 mb-1" />
          ))}
        </div>
      )}
      {data.deal_breakers?.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground mr-2">绝对不接受:</span>
          {data.deal_breakers.map((t: string) => (
            <TagBadge key={t} label={t} variant="danger" className="mr-1 mb-1" />
          ))}
        </div>
      )}
      {data.boundary_notes && (
        <p className="text-sm text-muted-foreground">{data.boundary_notes}</p>
      )}
    </div>
  )
}
