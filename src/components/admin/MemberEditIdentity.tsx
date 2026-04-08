"use client"

import {
  HOBBY_TAGS, ACTIVITY_TYPE_TAGS,
  PERSONALITY_SELF_TAGS, TABOO_TAGS,
} from "@/lib/constants/tags"
import type { MemberIdentityRow } from "@/types/member-detail"

type IdentityData = Partial<MemberIdentityRow> & Record<string, unknown>
interface Props { data: IdentityData; onChange: (data: IdentityData) => void }

function InputRow({ label, name, data, onChange, type = "text" }: {
  label: string; name: string; data: IdentityData; onChange: (d: IdentityData) => void; type?: string
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2.5">
        <input type={type} value={(data[name] as string | number) ?? ""}
          onChange={(e) => onChange({ ...data, [name]: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
      </td>
    </tr>
  )
}

function SelectRow({ label, name, options, data, onChange }: {
  label: string; name: string; options: readonly string[]; data: IdentityData; onChange: (d: IdentityData) => void
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2.5">
        <select value={(data[name] as string) ?? ""}
          onChange={(e) => onChange({ ...data, [name]: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary">
          <option value="">-</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
    </tr>
  )
}

function TagsRow({ label, name, options, data, onChange }: {
  label: string; name: string; options: readonly string[]; data: IdentityData; onChange: (d: IdentityData) => void
}) {
  const selected: string[] = (data[name] as string[]) ?? []
  function toggle(tag: string) {
    const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]
    onChange({ ...data, [name]: next })
  }
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24 align-top">{label}</td>
      <td className="py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {options.map((t) => (
            <button key={t} type="button" onClick={() => toggle(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                selected.includes(t)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}>{t}</button>
          ))}
        </div>
      </td>
    </tr>
  )
}

export function MemberEditIdentity({ data, onChange }: Props) {
  return (
    <table className="w-full"><tbody>
      <InputRow label="姓名" name="full_name" data={data} onChange={onChange} />
      <InputRow label="昵称" name="nickname" data={data} onChange={onChange} />
      <SelectRow label="性别" name="gender" options={["male", "female", "other"]} data={data} onChange={onChange} />
      <SelectRow label="年龄段" name="age_range" options={["18-20", "21-23", "24-26", "27-29", "30+"]} data={data} onChange={onChange} />
      <InputRow label="国籍" name="nationality" data={data} onChange={onChange} />
      <InputRow label="所在地" name="current_city" data={data} onChange={onChange} />
      <InputRow label="学校" name="school_name" data={data} onChange={onChange} />
      <InputRow label="学部" name="department" data={data} onChange={onChange} />
      <SelectRow label="学位" name="degree_level" options={["学士", "修士", "博士", "研究生", "别科", "语言学校"]} data={data} onChange={onChange} />
      <InputRow label="课程语言" name="course_language" data={data} onChange={onChange} />
      <InputRow label="入学年" name="enrollment_year" data={data} onChange={onChange} type="number" />
      <TagsRow label="爱好" name="hobby_tags" options={HOBBY_TAGS} data={data} onChange={onChange} />
      <TagsRow label="活动类型" name="activity_type_tags" options={ACTIVITY_TYPE_TAGS} data={data} onChange={onChange} />
      <TagsRow label="性格自评" name="personality_self_tags" options={PERSONALITY_SELF_TAGS} data={data} onChange={onChange} />
      <TagsRow label="个人NG" name="taboo_tags" options={TABOO_TAGS} data={data} onChange={onChange} />
    </tbody></table>
  )
}
