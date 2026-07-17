"use client"

import { useState, useTransition } from "react"
import { Save, SlidersHorizontal } from "lucide-react"
import { updatePlayerActivitySettings } from "@/app/admin/scripts/settings/actions"
import { Button } from "@/components/ui/button"

export function PlayerActivitySettingsForm({ initialLimit }: { initialLimit: number }) {
  const [limit, setLimit] = useState(initialLimit)
  const [savedLimit, setSavedLimit] = useState(initialLimit)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await updatePlayerActivitySettings(limit)
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedLimit(result.socialHomeLimit ?? limit)
      setLimit(result.socialHomeLimit ?? limit)
      setMessage("活动首页设置已保存")
    })
  }

  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10" aria-labelledby="player-activity-settings-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="player-activity-settings-title" className="font-semibold">Player 活动首页</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              控制“社交剧本类”模块最多显示多少个已勾选剧本。
            </p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            精选剧本数量
            <input
              type="number"
              min={1}
              max={12}
              step={1}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              disabled={pending}
              className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <Button onClick={save} disabled={pending || limit === savedLimit || !Number.isInteger(limit) || limit < 1 || limit > 12}>
            <Save className="size-4" />
            {pending ? "保存中" : "保存"}
          </Button>
        </div>
      </div>
      {(message || error) && (
        <p role={error ? "alert" : "status"} className={`mt-3 text-sm ${error ? "text-destructive" : "text-primary"}`}>
          {error ?? message}
        </p>
      )}
    </section>
  )
}
