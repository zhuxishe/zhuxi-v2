"use client"

export type MemberApplicationEditData = {
  interview_date: string | null
  interviewer: string | null
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
    </tbody></table>
  )
}
