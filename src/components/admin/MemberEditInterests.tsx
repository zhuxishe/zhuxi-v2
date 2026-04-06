"use client"

import {
  ACTIVITY_AREA_OPTIONS, GROUP_SIZE_OPTIONS, ACTIVITY_FREQUENCY_OPTIONS,
  TIME_SLOT_OPTIONS, BUDGET_RANGE_OPTIONS, TRAVEL_RADIUS_OPTIONS,
  SOCIAL_GOAL_OPTIONS, SCENARIO_MODE_OPTIONS, SCRIPT_PREFERENCE_OPTIONS,
  NON_SCRIPT_PREFERENCE_OPTIONS,
} from "@/lib/constants/supplementary"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { data: any; onChange: (data: any) => void }

function SelectRow({ label, name, options, data, onChange }: {
  label: string; name: string; options: readonly string[]; data: any; onChange: (d: any) => void
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2.5">
        <select value={data[name] ?? ""}
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
  label: string; name: string; options: readonly string[]; data: any; onChange: (d: any) => void
}) {
  const selected: string[] = data[name] ?? []
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
                selected.includes(t) ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              }`}>{t}</button>
          ))}
        </div>
      </td>
    </tr>
  )
}

function ToggleRow({ label, name, data, onChange }: {
  label: string; name: string; data: any; onChange: (d: any) => void
}) {
  const val = data[name] ?? true
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2.5">
        <button type="button" onClick={() => onChange({ ...data, [name]: !val })}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            val ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>{val ? "是" : "否"}</button>
      </td>
    </tr>
  )
}

function InputRow({ label, name, data, onChange }: {
  label: string; name: string; data: any; onChange: (d: any) => void
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2.5">
        <input value={data[name] ?? ""}
          onChange={(e) => onChange({ ...data, [name]: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
      </td>
    </tr>
  )
}

export function MemberEditInterests({ data, onChange }: Props) {
  return (
    <table className="w-full"><tbody>
      <SelectRow label="活动区域" name="activity_area" options={ACTIVITY_AREA_OPTIONS} data={data} onChange={onChange} />
      <InputRow label="最近车站" name="nearest_station" data={data} onChange={onChange} />
      <SelectRow label="理想人数" name="ideal_group_size" options={GROUP_SIZE_OPTIONS} data={data} onChange={onChange} />
      <SelectRow label="活动频率" name="activity_frequency" options={ACTIVITY_FREQUENCY_OPTIONS} data={data} onChange={onChange} />
      <SelectRow label="预算" name="budget_range" options={BUDGET_RANGE_OPTIONS} data={data} onChange={onChange} />
      <SelectRow label="移动范围" name="travel_radius" options={TRAVEL_RADIUS_OPTIONS} data={data} onChange={onChange} />
      <SelectRow label="主要目标" name="social_goal_primary" options={SOCIAL_GOAL_OPTIONS} data={data} onChange={onChange} />
      <SelectRow label="次要目标" name="social_goal_secondary" options={SOCIAL_GOAL_OPTIONS} data={data} onChange={onChange} />
      <TagsRow label="剧本类型" name="scenario_mode_pref" options={SCENARIO_MODE_OPTIONS} data={data} onChange={onChange} />
      <TagsRow label="剧本偏好" name="script_preference" options={SCRIPT_PREFERENCE_OPTIONS} data={data} onChange={onChange} />
      <TagsRow label="非剧本" name="non_script_preference" options={NON_SCRIPT_PREFERENCE_OPTIONS} data={data} onChange={onChange} />
      <TagsRow label="时间偏好" name="preferred_time_slots" options={TIME_SLOT_OPTIONS} data={data} onChange={onChange} />
      <ToggleRow label="接受新手" name="accept_beginners" data={data} onChange={onChange} />
      <ToggleRow label="接受跨校" name="accept_cross_school" data={data} onChange={onChange} />
    </tbody></table>
  )
}
