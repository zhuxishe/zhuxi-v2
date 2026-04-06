"use client"

import {
  ACTIVITY_AREA_OPTIONS,
  GROUP_SIZE_OPTIONS,
  ACTIVITY_FREQUENCY_OPTIONS,
  TIME_SLOT_OPTIONS,
  BUDGET_RANGE_OPTIONS,
  TRAVEL_RADIUS_OPTIONS,
  SOCIAL_GOAL_OPTIONS,
  SCENARIO_MODE_OPTIONS,
} from "@/lib/constants/supplementary"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  data: any
  onChange: (data: any) => void
}

function SelectField({ label, name, options, data, onChange }: {
  label: string; name: string; options: readonly string[]; data: any; onChange: (d: any) => void
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

function TagToggle({ label, name, options, data, onChange }: {
  label: string; name: string; options: readonly string[]; data: any; onChange: (d: any) => void
}) {
  const selected: string[] = data[name] ?? []
  function toggle(tag: string) {
    const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]
    onChange({ ...data, [name]: next })
  }
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-2 block">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
              selected.includes(t)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"
            }`}
          >{t}</button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, name, data, onChange }: {
  label: string; name: string; data: any; onChange: (d: any) => void
}) {
  const val = data[name] ?? true
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button type="button" onClick={() => onChange({ ...data, [name]: !val })}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          val ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}
      >{val ? "是" : "否"}</button>
    </div>
  )
}

export function MemberEditInterests({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="活动区域" name="activity_area" options={ACTIVITY_AREA_OPTIONS} data={data} onChange={onChange} />
        <div>
          <label className="text-xs text-muted-foreground">最近车站</label>
          <input value={data.nearest_station ?? ""} onChange={(e) => onChange({ ...data, nearest_station: e.target.value })}
            className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <SelectField label="理想人数" name="ideal_group_size" options={GROUP_SIZE_OPTIONS} data={data} onChange={onChange} />
        <SelectField label="活动频率" name="activity_frequency" options={ACTIVITY_FREQUENCY_OPTIONS} data={data} onChange={onChange} />
        <SelectField label="预算" name="budget_range" options={BUDGET_RANGE_OPTIONS} data={data} onChange={onChange} />
        <SelectField label="移动范围" name="travel_radius" options={TRAVEL_RADIUS_OPTIONS} data={data} onChange={onChange} />
        <SelectField label="主要社交目标" name="social_goal_primary" options={SOCIAL_GOAL_OPTIONS} data={data} onChange={onChange} />
        <SelectField label="次要社交目标" name="social_goal_secondary" options={SOCIAL_GOAL_OPTIONS} data={data} onChange={onChange} />
      </div>
      <TagToggle label="剧本类型" name="scenario_mode_pref" options={SCENARIO_MODE_OPTIONS} data={data} onChange={onChange} />
      <TagToggle label="时间偏好" name="preferred_time_slots" options={TIME_SLOT_OPTIONS} data={data} onChange={onChange} />
      <Toggle label="接受新手" name="accept_beginners" data={data} onChange={onChange} />
      <Toggle label="接受跨校" name="accept_cross_school" data={data} onChange={onChange} />
    </div>
  )
}
