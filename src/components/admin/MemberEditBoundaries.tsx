"use client"

import type { MemberBoundariesRow } from "@/types/member-detail"

type BoundariesData = Partial<MemberBoundariesRow> & Record<string, unknown>
interface Props { data: BoundariesData; onChange: (data: BoundariesData) => void }

function InputRow({ label, name, data, onChange, placeholder }: {
  label: string; name: string; data: BoundariesData; onChange: (d: BoundariesData) => void; placeholder?: string
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2.5">
        <input value={(data[name] as string) ?? ""} placeholder={placeholder}
          onChange={(e) => onChange({ ...data, [name]: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
      </td>
    </tr>
  )
}

export function MemberEditBoundaries({ data, onChange }: Props) {
  function updateTags(field: string, text: string) {
    const tags = text.split(",").map((t) => t.trim()).filter(Boolean)
    onChange({ ...data, [field]: tags })
  }

  return (
    <table className="w-full"><tbody>
      <InputRow label="年龄范围" name="preferred_age_range" data={data} onChange={onChange} placeholder="例：21-26" />
      <InputRow label="性别比例" name="preferred_gender_mix" data={data} onChange={onChange} placeholder="例：混合、同性" />
      <tr className="border-b border-border/50">
        <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">禁忌标签</td>
        <td className="py-2.5">
          <input value={(data.taboo_tags ?? []).join(", ")}
            onChange={(e) => updateTags("taboo_tags", e.target.value)}
            placeholder="逗号分隔"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
        </td>
      </tr>
      <tr className="border-b border-border/50">
        <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">绝不接受</td>
        <td className="py-2.5">
          <input value={(data.deal_breakers ?? []).join(", ")}
            onChange={(e) => updateTags("deal_breakers", e.target.value)}
            placeholder="逗号分隔"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
        </td>
      </tr>
      <tr className="border-b border-border/50">
        <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24 align-top">备注</td>
        <td className="py-2.5">
          <textarea value={data.boundary_notes ?? ""} rows={2}
            onChange={(e) => onChange({ ...data, boundary_notes: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary resize-none" />
        </td>
      </tr>
    </tbody></table>
  )
}
