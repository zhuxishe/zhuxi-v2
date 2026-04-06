import { TagBadge } from "@/components/shared/TagBadge"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { data: any }

export function MemberLanguageSection({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h3 className="text-sm font-semibold text-foreground mb-2">语言偏好</h3>
        <p className="text-sm text-muted-foreground">未填写</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">语言偏好</h3>
      <div>
        <span className="text-xs text-muted-foreground mr-2">沟通语言:</span>
        {data.communication_language_pref?.map((l: string) => (
          <TagBadge key={l} label={l} variant="info" className="mr-1 mb-1" />
        ))}
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">日语水平</dt>
        <dd className="text-sm font-medium">{data.japanese_level || "-"}</dd>
      </div>
    </div>
  )
}
