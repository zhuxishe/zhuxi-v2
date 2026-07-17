"use client"

import { NumInput } from "@/components/admin/FormInputs"

interface Props {
  isSocialScript: boolean
  onIsSocialScriptChange: (value: boolean) => void
  showOnPlayerActivity: boolean
  onShowOnPlayerActivityChange: (value: boolean) => void
  playerActivityOrder: number
  onPlayerActivityOrderChange: (value: number) => void
  pinInSocialLibrary: boolean
  onPinInSocialLibraryChange: (value: boolean) => void
  socialLibraryOrder: number
  onSocialLibraryOrderChange: (value: number) => void
}

export function ScriptActivityPlacementFields(props: Props) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Player 活动展示</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          这些设置只影响 Player App，不改变官网“精选活动”展示。
        </p>
      </div>

      <ToggleField
        checked={props.isSocialScript}
        onChange={(value) => {
          props.onIsSocialScriptChange(value)
          if (!value) {
            props.onShowOnPlayerActivityChange(false)
            props.onPinInSocialLibraryChange(false)
          }
        }}
        label="归入社交剧本类"
        hint="关闭后不会进入 Player App 的社交剧本模块。"
      />
      <ToggleField
        checked={props.showOnPlayerActivity}
        onChange={props.onShowOnPlayerActivityChange}
        disabled={!props.isSocialScript}
        label="在活动父菜单展示"
        hint="仍需保持剧本为“已发布”，并受首页展示数量限制。"
      />
      <NumInput label="活动父菜单排序" value={props.playerActivityOrder} onChange={props.onPlayerActivityOrderChange} />
      <ToggleField
        checked={props.pinInSocialLibrary}
        onChange={props.onPinInSocialLibraryChange}
        disabled={!props.isSocialScript}
        label="在社交剧本库置顶"
        hint="置顶内容会优先于普通剧本显示。"
      />
      <NumInput label="社交剧本库排序" value={props.socialLibraryOrder} onChange={props.onSocialLibraryOrderChange} />
    </section>
  )
}

function ToggleField({ checked, onChange, label, hint, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
