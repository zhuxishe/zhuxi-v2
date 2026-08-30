"use client"

export type MemberApplicationEditData = {
  interview_date: string | null
  interviewer: string | null
  attractiveness_score: number | null
}

interface Props {
  data: MemberApplicationEditData
  onChange: (data: MemberApplicationEditData) => void
}

const INPUT_CLASS = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"

export function MemberEditApplication({ data, onChange }: Props) {
  return (
    <table className="w-full"><tbody>
      <tr className="border-b border-border/50">
        <td className="w-24 whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">面试日期</td>
        <td className="py-2.5">
          <input
            type="date"
            value={data.interview_date ?? ""}
            onChange={(event) => onChange({ ...data, interview_date: event.target.value || null })}
            className={INPUT_CLASS}
          />
        </td>
      </tr>
      <tr className="border-b border-border/50">
        <td className="w-24 whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">面试负责人</td>
        <td className="py-2.5">
          <input
            value={data.interviewer ?? ""}
            onChange={(event) => onChange({ ...data, interviewer: event.target.value || null })}
            maxLength={500}
            className={INPUT_CLASS}
          />
        </td>
      </tr>
      <tr className="border-b border-border/50">
        <td className="w-24 whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">综合吸引力</td>
        <td className="py-2.5">
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={data.attractiveness_score ?? ""}
            onChange={(event) => onChange({
              ...data,
              attractiveness_score: event.target.value === "" ? null : Number(event.target.value),
            })}
            className={INPUT_CLASS}
          />
          <span className="mt-1 block text-xs text-muted-foreground">1–5；可以清空。评估记录变化仍可能按现有规则重新计算此值。</span>
        </td>
      </tr>
    </tbody></table>
  )
}
