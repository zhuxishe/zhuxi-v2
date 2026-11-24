"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  loadActivityRegistrationLinkOptions,
  saveActivityRegistrationLink,
  type ActivityRegistrationLinkTarget,
} from "@/app/admin/activity-registration-links/actions"
import type { ActivityRegistrationLinkSummary } from "@/lib/activity-registration-links/admin-summaries"

interface Props {
  target: ActivityRegistrationLinkTarget
  title: string
  current: ActivityRegistrationLinkSummary | null
  disabled?: boolean
  compact?: boolean
}

type Options = NonNullable<Awaited<ReturnType<typeof loadActivityRegistrationLinkOptions>>["options"]>
type LinkOptions = { current: ActivityRegistrationLinkSummary | null; options: Options }

export function ActivityRegistrationLink(props: Props) {
  return <ActivityRegistrationLinkControl key={props.current?.id ?? "unlinked"} {...props} />
}

function ActivityRegistrationLinkControl({ target, title, current, disabled, compact }: Props) {
  const router = useRouter()
  const request = useRef(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState<LinkOptions | null>(null)
  const [saved, setSaved] = useState<{ current: ActivityRegistrationLinkSummary | null } | null>(null)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const [unlink, setUnlink] = useState(false)
  const isLargeActivity = "largeActivityId" in target
  const counterpartLabel = isLargeActivity ? "报名轮次" : "大型活动"
  const currentLink = saved === null ? current : saved.current
  const needsRestore = Boolean(!isLargeActivity && draft?.current?.archived)
  const selected = draft?.options.find((option) => option.id === selectedId && !option.linkedTo)
  const counterpartTitle = selected?.title
  const search = query.trim().toLocaleLowerCase()
  const options = draft?.options.filter((option) => `${option.title} ${option.detail ?? ""}`.toLocaleLowerCase().includes(search)) ?? []
  const selectionVisible = options.some((option) => option.id === selectedId)

  async function loadOptions() {
    const id = ++request.current
    setLoading(true)
    setDraft(null)
    setError("")
    setQuery("")
    setSelectedId("")
    setUnlink(false)
    try {
      const result = await loadActivityRegistrationLinkOptions(target)
      if (request.current !== id) return
      if (result.error || !result.options) {
        setError(result.error ?? "暂时无法读取关联选项，请重试。")
      } else {
        setDraft({ current: result.current ?? null, options: result.options })
        setSaved({ current: result.current ?? null })
      }
    } catch {
      if (request.current === id) setError("暂时无法读取关联选项，请重试。")
    } finally {
      if (request.current === id) setLoading(false)
    }
  }

  function handleOpenChange(value: boolean) {
    if (saving) return
    setOpen(value)
    if (value) {
      void loadOptions()
    } else {
      request.current += 1
    }
  }

  async function save() {
    if (!draft || saving || needsRestore || (!unlink && (!selected || !selectionVisible)) || (unlink && !draft.current)) return
    const counterpartId = unlink ? null : selected?.id ?? null
    setSaving(true)
    setError("")
    try {
      const result = await saveActivityRegistrationLink({
        target,
        counterpartId,
        expectedCounterpartId: draft.current?.id ?? null,
      })
      if (result.error || result.success !== true) {
        setError(result.error ?? "暂时无法保存关联，请重试。")
        return
      }
      setSaved({ current: counterpartId && counterpartTitle ? { id: counterpartId, title: counterpartTitle } : null })
      setOpen(false)
      router.refresh()
    } catch {
      setError("未收到保存结果，请重新读取后核对关联。")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger render={<Button type="button" variant="outline" size={compact ? "xs" : "sm"} className="min-h-8" disabled={disabled} />}>
          <Link2 aria-hidden="true" className="size-4" />
          {currentLink ? "管理报名关联" : isLargeActivity ? "关联报名轮次" : "关联大型活动"}
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>选择{counterpartLabel}</DialogTitle>
            <DialogDescription className="break-words">
              「{title}」{draft?.current ? `已关联「${draft.current.title}」。` : `可关联一个${counterpartLabel}。`}
            </DialogDescription>
          </DialogHeader>
          {loading && <p role="status" className="text-muted-foreground">正在读取关联选项…</p>}
          {error && (
            <div className="space-y-2">
              <p role="alert" className="text-destructive">{error}</p>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void loadOptions()}>重新读取</Button>
            </div>
          )}
          {needsRestore && <p className="text-sm text-muted-foreground">在大型活动回收站恢复已归档的活动后，才能更换或解除关联。</p>}
          {draft && !unlink && !needsRestore && (
            <fieldset disabled={saving} className="min-w-0 space-y-2">
              <label className="grid gap-1 font-medium">
                搜索{counterpartLabel}
                <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" className="min-h-10 rounded-md border border-input bg-background px-3" />
              </label>
              <div className="max-h-60 overflow-auto rounded-md border border-border">
                {options.length === 0 ? <p className="p-3 text-muted-foreground">没有符合条件的{counterpartLabel}。</p> :
                  options.map((option) => (
                    <label key={option.id} className="flex min-h-12 items-start gap-2 border-b border-border px-3 py-2 last:border-0">
                      <input
                        type="radio"
                        name="registration-link-choice"
                        checked={selectedId === option.id}
                        disabled={Boolean(option.linkedTo) || draft.current?.id === option.id}
                        onChange={() => setSelectedId(option.id)}
                        className="mt-1 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{option.title}</span>
                        {option.detail && <span className="block break-words text-xs text-muted-foreground">{option.detail}</span>}
                        {(option.linkedTo || draft.current?.id === option.id) && (
                          <span className="block break-words text-xs text-muted-foreground">
                            {draft.current?.id === option.id ? "当前关联" : `已关联「${option.linkedTo}」`}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
              </div>
              {draft.current && selected && <p className="text-sm text-muted-foreground">确认后将改为关联「{selected.title}」。</p>}
            </fieldset>
          )}
          {draft?.current && unlink && <p className="text-sm leading-6 text-muted-foreground">将解除与「{draft.current.title}」的关联。已有报名和评分留在原轮次，备用报名链接如有填写会恢复使用。</p>}
          <DialogFooter>
            {draft?.current && !unlink && !needsRestore && <Button type="button" variant="ghost" disabled={saving} onClick={() => setUnlink(true)} className="sm:mr-auto">解除关联</Button>}
            <Button type="button" variant="outline" disabled={saving} onClick={() => unlink ? setUnlink(false) : handleOpenChange(false)}>{unlink ? "返回" : "取消"}</Button>
            {draft && !needsRestore && <Button
              type="button"
              variant={unlink ? "destructive" : "default"}
              disabled={saving || (unlink ? !draft.current : !selected || !selectionVisible)}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : unlink ? "确认解除关联" : draft.current ? "确定换绑" : "确定关联"}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {currentLink && (
        <p className="min-w-0 break-words text-xs text-muted-foreground">
          已关联{counterpartLabel}：
          {isLargeActivity && currentLink.archived ? currentLink.title : (
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href={
              isLargeActivity
                ? `/admin/matching/rounds/${currentLink.id}`
                : `/admin/reviews?${new URLSearchParams({ activityId: currentLink.id, ...(currentLink.archived && { view: "archived" }) })}`
            }>{currentLink.title}</Link>
          )}
        </p>
      )}
    </div>
  )
}
