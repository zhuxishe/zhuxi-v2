"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  data: any
  onChange: (data: any) => void
}

export function MemberEditBoundaries({ data, onChange }: Props) {
  function updateTags(field: string, text: string) {
    const tags = text.split(",").map((t) => t.trim()).filter(Boolean)
    onChange({ ...data, [field]: tags })
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
      <h3 className="text-sm font-semibold">个人边界（仅管理员可编辑）</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">理想年龄范围</label>
          <input
            value={data.preferred_age_range ?? ""}
            onChange={(e) => onChange({ ...data, preferred_age_range: e.target.value })}
            placeholder="例：21-26"
            className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">性别比例偏好</label>
          <input
            value={data.preferred_gender_mix ?? ""}
            onChange={(e) => onChange({ ...data, preferred_gender_mix: e.target.value })}
            placeholder="例：混合、同性"
            className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">禁忌标签（逗号分隔）</label>
        <input
          value={(data.taboo_tags ?? []).join(", ")}
          onChange={(e) => updateTags("taboo_tags", e.target.value)}
          className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">绝对不接受（逗号分隔）</label>
        <input
          value={(data.deal_breakers ?? []).join(", ")}
          onChange={(e) => updateTags("deal_breakers", e.target.value)}
          className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">备注</label>
        <textarea
          value={data.boundary_notes ?? ""}
          onChange={(e) => onChange({ ...data, boundary_notes: e.target.value })}
          rows={2}
          className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
        />
      </div>
    </div>
  )
}
