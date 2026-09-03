"use client"

import { useMemo, useState, useTransition } from "react"
import { Save, SlidersHorizontal } from "lucide-react"
import {
  updatePlayerActivitySettings,
  type PlayerActivitySettingsInput,
} from "@/app/admin/scripts/settings/actions"
import { Button } from "@/components/ui/button"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

interface Props {
  initialSettings: PlayerActivitySettingsInput
  canManage: boolean
}

export function PlayerActivitySettingsForm({ initialSettings, canManage }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [saved, setSaved] = useState(initialSettings)
  const [auditReason, setAuditReason] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const changed = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(saved),
    [saved, settings],
  )

  function patch<K extends keyof PlayerActivitySettingsInput>(
    key: K,
    value: PlayerActivitySettingsInput[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function save() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await updatePlayerActivitySettings(settings, auditReason)
      if (result.error || !result.settings) {
        setError(result.error ?? "活动首页设置保存失败")
        return
      }
      setSaved(result.settings)
      setSettings(result.settings)
      setAuditReason("")
      setMessage("玩家端栏目设置已保存")
    })
  }

  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10" aria-labelledby="player-activity-settings-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="player-activity-settings-title" className="font-semibold">玩家端活动栏目</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            分别控制大型活动、社交剧本和完整剧本库。关闭栏目不会修改或删除其中内容。
          </p>
          {!canManage && (
            <p className="mt-1 text-xs font-medium text-amber-700">只有超级管理员可以修改这些全局设置。</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <ModuleToggle
          label="大型活动"
          checked={settings.largeActivitiesEnabled}
          disabled={!canManage || pending}
          onChange={(value) => patch("largeActivitiesEnabled", value)}
        />
        <ModuleToggle
          label="社交剧本"
          checked={settings.socialScriptsEnabled}
          disabled={!canManage || pending}
          onChange={(value) => patch("socialScriptsEnabled", value)}
        />
        <ModuleToggle
          label="完整剧本库"
          checked={settings.scriptLibraryEnabled}
          disabled={!canManage || pending}
          onChange={(value) => patch("scriptLibraryEnabled", value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <LimitField
          label="首页大型活动数量"
          value={settings.largeHomeLimit}
          disabled={!canManage || pending}
          onChange={(value) => patch("largeHomeLimit", value)}
        />
        <LimitField
          label="首页社交剧本数量"
          value={settings.socialHomeLimit}
          disabled={!canManage || pending}
          onChange={(value) => patch("socialHomeLimit", value)}
        />
        {canManage && (
          <label className="grid min-w-64 flex-1 gap-1 text-xs font-medium text-muted-foreground">
            修改理由（必填）
            <input
              value={auditReason}
              onChange={(event) => setAuditReason(event.target.value)}
              minLength={4}
              maxLength={500}
              placeholder="4–500 字，将写入操作审计"
              disabled={pending}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        )}
        {canManage && (
          <Button
            onClick={save}
            disabled={
              pending
              || !changed
              || !adminAuditReasonIsValid(auditReason)
              || !validLimit(settings.largeHomeLimit)
              || !validLimit(settings.socialHomeLimit)
            }
          >
            <Save className="size-4" />
            {pending ? "保存中" : "保存"}
          </Button>
        )}
      </div>
      {(message || error) && (
        <p role={error ? "alert" : "status"} className={`mt-3 text-sm ${error ? "text-destructive" : "text-primary"}`}>
          {error ?? message}
        </p>
      )}
    </section>
  )
}

function ModuleToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className={`flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3 text-sm ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
    </label>
  )
}

function LimitField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        min={0}
        max={12}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="h-10 w-28 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  )
}

function validLimit(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 12
}
