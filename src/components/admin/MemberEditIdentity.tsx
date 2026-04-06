"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  data: any
  onChange: (data: any) => void
}

function Field({ label, name, data, onChange, type = "text" }: {
  label: string; name: string; data: any; onChange: (d: any) => void; type?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={data[name] ?? ""}
        onChange={(e) => onChange({ ...data, [name]: e.target.value })}
        className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  )
}

function SelectField({ label, name, options, data, onChange }: {
  label: string; name: string; options: string[]; data: any; onChange: (d: any) => void
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <select
        value={data[name] ?? ""}
        onChange={(e) => onChange({ ...data, [name]: e.target.value })}
        className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="">-</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

export function MemberEditIdentity({ data, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="姓名" name="full_name" data={data} onChange={onChange} />
      <Field label="昵称" name="nickname" data={data} onChange={onChange} />
      <SelectField label="性别" name="gender" options={["male", "female", "other"]} data={data} onChange={onChange} />
      <SelectField label="年龄段" name="age_range" options={["18-20", "21-23", "24-26", "27-29", "30+"]} data={data} onChange={onChange} />
      <Field label="国籍" name="nationality" data={data} onChange={onChange} />
      <Field label="所在地" name="current_city" data={data} onChange={onChange} />
      <Field label="学校" name="school_name" data={data} onChange={onChange} />
      <Field label="学部/研究科" name="department" data={data} onChange={onChange} />
      <SelectField label="学位阶段" name="degree_level" options={["学士", "修士", "博士", "研究生", "别科", "语言学校"]} data={data} onChange={onChange} />
      <Field label="课程语言" name="course_language" data={data} onChange={onChange} />
      <Field label="入学年份" name="enrollment_year" data={data} onChange={onChange} type="number" />
    </div>
  )
}
