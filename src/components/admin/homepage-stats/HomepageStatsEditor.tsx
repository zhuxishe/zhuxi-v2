"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Plus, RotateCcw, Save, Sigma, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MAX_FEATURED_SCHOOLS, getOtherCount } from "@/lib/homepage-school-stats"
import { publishHomepageSchoolStats, restoreHomepageSchoolStats } from "@/app/admin/homepage-stats/actions"
import { HomepageSchoolRow } from "./HomepageSchoolRow"
import { HomepageStatsHistory } from "./HomepageStatsHistory"
import { HomepageStatsPreview } from "./HomepageStatsPreview"
import type {
  HomepageFeaturedSchoolDraft,
  HomepageSchoolStatsDraft,
  HomepageSchoolStatsHistoryItem,
  HomepageSchoolStatsSnapshot,
} from "./types"

const INPUT_CLASS = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold tabular-nums outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-60"
const MAX_INT = 2147483647
const UNSAVED_HISTORY_GUARD = "__homepageStatsUnsavedGuard"
const UNSAVED_WARNING = "你有尚未发布的主页统计修改。确定要离开并放弃这些修改吗？"

type StatusMessage = { tone: "success" | "error"; text: string } | null

function toDraft(stats: HomepageSchoolStatsDraft): HomepageSchoolStatsDraft {
  return {
    totalMembers: stats.totalMembers,
    totalSchools: stats.totalSchools,
    featuredSchools: stats.featuredSchools.map((school) => ({ ...school })),
  }
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function validateDraft(draft: HomepageSchoolStatsDraft) {
  const errors: string[] = []
  if (!Number.isSafeInteger(draft.totalMembers) || draft.totalMembers < 0 || draft.totalMembers > MAX_INT) {
    errors.push("总人数必须是 0 至 2,147,483,647 之间的整数")
  }
  if (!Number.isSafeInteger(draft.totalSchools) || draft.totalSchools < 0 || draft.totalSchools > MAX_INT) {
    errors.push("学校总数必须是 0 至 2,147,483,647 之间的整数")
  }
  if (draft.featuredSchools.length > MAX_FEATURED_SCHOOLS) {
    errors.push(`精选学校最多 ${MAX_FEATURED_SCHOOLS} 所`)
  }
  if (Number.isSafeInteger(draft.totalSchools) && draft.totalSchools < draft.featuredSchools.length) {
    errors.push("学校总数不能少于精选学校数量")
  }
  if (Number.isSafeInteger(draft.totalMembers) && Number.isSafeInteger(draft.totalSchools) && draft.totalSchools > draft.totalMembers) {
    errors.push("学校总数不能大于总人数")
  }

  const ids = new Set<string>()
  const zhNames = new Set<string>()
  const jaNames = new Set<string>()
  let featuredTotal = 0
  draft.featuredSchools.forEach((school, index) => {
    const label = `精选学校 ${index + 1}`
    const zh = school.zh.trim()
    const ja = school.ja.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(school.id) || school.id.toLowerCase() === "other" || ids.has(school.id)) errors.push(`${label}的识别信息无效，请删除后重新添加`)
    ids.add(school.id)
    if (!zh || zh.length > 40) errors.push(`${label}的中文名称必须为 1 至 40 个字符`)
    if (!ja || ja.length > 40) errors.push(`${label}的日文名称必须为 1 至 40 个字符`)
    if (zh === "其他" || zh === "其它" || ja === "その他") errors.push(`${label}不能使用系统保留的“其他”名称`)
    const zhKey = zh.toLocaleLowerCase()
    const jaKey = ja.toLocaleLowerCase("ja")
    if (zh && zhNames.has(zhKey)) errors.push(`中文名称“${zh}”重复`)
    if (ja && jaNames.has(jaKey)) errors.push(`日文名称“${ja}”重复`)
    zhNames.add(zhKey)
    jaNames.add(jaKey)
    if (!Number.isSafeInteger(school.count) || school.count < 0 || school.count > MAX_INT) {
      errors.push(`${label}人数必须是非负整数`)
    } else {
      featuredTotal += school.count
    }
  })
  if (Number.isSafeInteger(draft.totalMembers) && featuredTotal > draft.totalMembers) {
    errors.push("精选学校人数合计不能超过总人数")
  }
  return errors
}

function safePreviewDraft(draft: HomepageSchoolStatsDraft): HomepageSchoolStatsDraft {
  const totalMembers = Number.isSafeInteger(draft.totalMembers) && draft.totalMembers >= 0 ? draft.totalMembers : 0
  return {
    totalMembers,
    totalSchools: Number.isSafeInteger(draft.totalSchools) && draft.totalSchools >= 0 ? draft.totalSchools : 0,
    featuredSchools: draft.featuredSchools.map((school) => ({
      ...school,
      zh: school.zh.trim() || "未命名",
      ja: school.ja.trim() || "名称未設定",
      count: Number.isSafeInteger(school.count) && school.count >= 0 ? Math.min(school.count, totalMembers) : 0,
    })),
  }
}

function changedSchoolDetails(current: HomepageSchoolStatsDraft, next: HomepageSchoolStatsDraft) {
  return JSON.stringify(current.featuredSchools) !== JSON.stringify(next.featuredSchools)
}

function getInvalidSchoolFields(draft: HomepageSchoolStatsDraft) {
  const zhCounts = new Map<string, number>()
  const jaCounts = new Map<string, number>()
  for (const school of draft.featuredSchools) {
    const zh = school.zh.trim().toLocaleLowerCase()
    const ja = school.ja.trim().toLocaleLowerCase("ja")
    if (zh) zhCounts.set(zh, (zhCounts.get(zh) ?? 0) + 1)
    if (ja) jaCounts.set(ja, (jaCounts.get(ja) ?? 0) + 1)
  }

  return new Map(draft.featuredSchools.map((school) => {
    const zh = school.zh.trim()
    const ja = school.ja.trim()
    return [school.id, {
      zh: !zh || zh.length > 40 || zh === "其他" || zh === "其它"
        || (zhCounts.get(zh.toLocaleLowerCase()) ?? 0) > 1,
      ja: !ja || ja.length > 40 || ja === "その他"
        || (jaCounts.get(ja.toLocaleLowerCase("ja")) ?? 0) > 1,
      count: !Number.isSafeInteger(school.count) || school.count < 0 || school.count > MAX_INT,
    }] as const
  }))
}

export function HomepageStatsEditor({
  initialStats,
  history,
}: {
  initialStats: HomepageSchoolStatsSnapshot
  history: HomepageSchoolStatsHistoryItem[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<HomepageSchoolStatsDraft>(() => toDraft(initialStats))
  const [published, setPublished] = useState<HomepageSchoolStatsSnapshot>(() => ({ ...initialStats, featuredSchools: initialStats.featuredSchools.map((school) => ({ ...school })) }))
  const [currentVersion, setCurrentVersion] = useState(initialStats.version)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<HomepageSchoolStatsHistoryItem | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [sortAnnouncement, setSortAnnouncement] = useState("")
  const [status, setStatus] = useState<StatusMessage>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [lastServerVersion, setLastServerVersion] = useState(initialStats.version)
  const navigationBypassRef = useRef(false)
  const hasUnsavedHistoryEntryRef = useRef(false)

  const hasNewServerVersion = initialStats.version > lastServerVersion
  const hasCanonicalServerTimestamp = initialStats.version === published.version
    && initialStats.publishedAt !== published.publishedAt
  if (hasNewServerVersion || hasCanonicalServerTimestamp) {
    if (hasNewServerVersion) setLastServerVersion(initialStats.version)
    if (initialStats.version > published.version) {
      const hasUnsavedDraft = JSON.stringify(draft) !== JSON.stringify(toDraft(published))
      const incoming = {
        ...initialStats,
        featuredSchools: initialStats.featuredSchools.map((school) => ({ ...school })),
      }
      setPublished(incoming)
      setCurrentVersion(incoming.version)
      if (hasUnsavedDraft) {
        setStatus({
          tone: "error",
          text: `其他管理员已发布版本 ${incoming.version}。你的草稿已保留，请重新确认后再发布。`,
        })
      } else {
        setDraft(toDraft(incoming))
        setStatus({ tone: "success", text: `已同步到最新版本 ${incoming.version}` })
      }
    } else if (hasCanonicalServerTimestamp) {
      setPublished({
        ...initialStats,
        featuredSchools: initialStats.featuredSchools.map((school) => ({ ...school })),
      })
    }
  }

  const featuredCount = useMemo(() => draft.featuredSchools.reduce(
    (sum, school) => sum + (Number.isSafeInteger(school.count) && school.count >= 0 ? school.count : 0),
    0,
  ), [draft.featuredSchools])
  const validationErrors = useMemo(() => validateDraft(draft), [draft])
  const previewDraft = useMemo(() => safePreviewDraft(draft), [draft])
  const invalidSchoolFields = useMemo(() => getInvalidSchoolFields(draft), [draft])
  const totalMembersInvalid = !Number.isSafeInteger(draft.totalMembers)
    || draft.totalMembers < 0
    || draft.totalMembers > MAX_INT
    || featuredCount > draft.totalMembers
    || (Number.isSafeInteger(draft.totalSchools) && draft.totalSchools > draft.totalMembers)
  const totalSchoolsInvalid = !Number.isSafeInteger(draft.totalSchools)
    || draft.totalSchools < 0
    || draft.totalSchools > MAX_INT
    || draft.totalSchools < draft.featuredSchools.length
    || (Number.isSafeInteger(draft.totalMembers) && draft.totalSchools > draft.totalMembers)
  const otherCount = useMemo(() => {
    const safeValue = getOtherCount(draft)
    const rawValue = Number.isSafeInteger(draft.totalMembers) ? draft.totalMembers - featuredCount : 0
    return rawValue < 0 ? rawValue : safeValue
  }, [draft, featuredCount])
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(toDraft(published)), [draft, published])
  const canPublish = isDirty && validationErrors.length === 0 && !pending

  useEffect(() => {
    if (!isDirty) return

    navigationBypassRef.current = false
    const currentState = window.history.state
    if (!currentState?.[UNSAVED_HISTORY_GUARD]) {
      const nextState = currentState && typeof currentState === "object"
        ? { ...currentState, [UNSAVED_HISTORY_GUARD]: true }
        : { [UNSAVED_HISTORY_GUARD]: true }
      window.history.pushState(nextState, "", window.location.href)
    }
    hasUnsavedHistoryEntryRef.current = true

    const warn = (event: BeforeUnloadEvent) => {
      if (navigationBypassRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    const guardLinkNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (destination.origin === current.origin
        && destination.pathname === current.pathname
        && destination.search === current.search
      ) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!window.confirm(UNSAVED_WARNING)) return

      navigationBypassRef.current = true
      hasUnsavedHistoryEntryRef.current = false
      window.location.replace(destination.href)
    }
    const guardFormNavigation = (event: SubmitEvent) => {
      if (navigationBypassRef.current || !(event.target instanceof HTMLFormElement)) return
      if (!event.target.matches("[data-homepage-stats-leave-guard]")) return
      if (window.confirm(UNSAVED_WARNING)) {
        navigationBypassRef.current = true
        window.setTimeout(() => {
          navigationBypassRef.current = false
        }, 0)
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const guardHistoryNavigation = () => {
      if (navigationBypassRef.current || !hasUnsavedHistoryEntryRef.current) return
      if (window.confirm(UNSAVED_WARNING)) {
        navigationBypassRef.current = true
        hasUnsavedHistoryEntryRef.current = false
        window.history.back()
        return
      }

      const currentHistoryState = window.history.state
      const nextState = currentHistoryState && typeof currentHistoryState === "object"
        ? { ...currentHistoryState, [UNSAVED_HISTORY_GUARD]: true }
        : { [UNSAVED_HISTORY_GUARD]: true }
      window.history.pushState(nextState, "", window.location.href)
    }

    window.addEventListener("beforeunload", warn)
    window.addEventListener("popstate", guardHistoryNavigation)
    document.addEventListener("click", guardLinkNavigation, true)
    document.addEventListener("submit", guardFormNavigation, true)
    return () => {
      window.removeEventListener("beforeunload", warn)
      window.removeEventListener("popstate", guardHistoryNavigation)
      document.removeEventListener("click", guardLinkNavigation, true)
      document.removeEventListener("submit", guardFormNavigation, true)
    }
  }, [isDirty])

  useEffect(() => {
    if (isDirty || !hasUnsavedHistoryEntryRef.current) return
    hasUnsavedHistoryEntryRef.current = false
    navigationBypassRef.current = true
    if (window.history.state?.[UNSAVED_HISTORY_GUARD]) window.history.back()
  }, [isDirty])

  function updateSchool(id: string, patch: Partial<HomepageFeaturedSchoolDraft>) {
    setStatus(null)
    setDraft((current) => ({
      ...current,
      featuredSchools: current.featuredSchools.map((school) => school.id === id ? { ...school, ...patch } : school),
    }))
  }

  function moveSchool(index: number, direction: -1 | 1) {
    setStatus(null)
    const destination = index + direction
    if (destination < 0 || destination >= draft.featuredSchools.length) return
    const next = [...draft.featuredSchools]
    const [school] = next.splice(index, 1)
    next.splice(destination, 0, school)
    setDraft({ ...draft, featuredSchools: next })
    setSortAnnouncement(`已将${school.zh.trim() || "未命名学校"}移至第 ${destination + 1} 位`)
  }

  function dropSchool(targetId: string) {
    if (!draggedId || draggedId === targetId) return setDraggedId(null)
    const sourceIndex = draft.featuredSchools.findIndex((school) => school.id === draggedId)
    const targetIndex = draft.featuredSchools.findIndex((school) => school.id === targetId)
    if (sourceIndex >= 0 && targetIndex >= 0) {
      const next = [...draft.featuredSchools]
      const [school] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, school)
      setDraft({ ...draft, featuredSchools: next })
      setSortAnnouncement(`已将${school.zh.trim() || "未命名学校"}移至第 ${targetIndex + 1} 位`)
    }
    setDraggedId(null)
  }

  function addSchool() {
    if (draft.featuredSchools.length >= MAX_FEATURED_SCHOOLS) return
    const id = crypto.randomUUID()
    setStatus(null)
    setDraft((current) => ({
      ...current,
      featuredSchools: [...current.featuredSchools, { id, zh: "", ja: "", count: 0 }],
    }))
    setSortAnnouncement(`已新增第 ${draft.featuredSchools.length + 1} 所精选学校`)
    requestAnimationFrame(() => document.getElementById(`homepage-school-${id}-zh`)?.focus())
  }

  function removeSchool(id: string) {
    setStatus(null)
    const removed = draft.featuredSchools.find((school) => school.id === id)
    setDraft({ ...draft, featuredSchools: draft.featuredSchools.filter((school) => school.id !== id) })
    setSortAnnouncement(`已删除${removed?.zh.trim() || "一所未命名学校"}`)
  }

  function requestPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canPublish) return
    setStatus(null)
    setModalError(null)
    setPublishDialogOpen(true)
  }

  function publish() {
    setStatus(null)
    startTransition(async () => {
      try {
        const result = await publishHomepageSchoolStats(draft, currentVersion)
        if (!result.ok) {
          setModalError(result.error)
          setStatus({ tone: "error", text: result.error })
          if (result.error.includes("其他管理员")) router.refresh()
          return
        }
        const normalized = {
          totalMembers: draft.totalMembers,
          totalSchools: draft.totalSchools,
          featuredSchools: draft.featuredSchools.map((school) => ({ ...school, zh: school.zh.trim(), ja: school.ja.trim() })),
        }
        const publishedAt = new Date().toISOString()
        setDraft(toDraft(normalized))
        setPublished({ ...normalized, version: result.version, publishedAt })
        setCurrentVersion(result.version)
        setModalError(null)
        setPublishDialogOpen(false)
        setStatus({ tone: "success", text: `主页统计已发布为版本 ${result.version}` })
        router.refresh()
      } catch {
        const message = "发布请求未完成，请检查网络后重试"
        setModalError(message)
        setStatus({ tone: "error", text: message })
      }
    })
  }

  function restore() {
    if (!restoreTarget) return
    const target = restoreTarget
    setStatus(null)
    startTransition(async () => {
      try {
        const result = await restoreHomepageSchoolStats(target.id, currentVersion)
        if (!result.ok) {
          setModalError(result.error)
          setStatus({ tone: "error", text: result.error })
          if (result.error.includes("其他管理员")) router.refresh()
          return
        }
        const restoredDraft = toDraft(target)
        const publishedAt = new Date().toISOString()
        setDraft(restoredDraft)
        setPublished({ ...restoredDraft, version: result.version, publishedAt })
        setCurrentVersion(result.version)
        setModalError(null)
        setRestoreTarget(null)
        setStatus({ tone: "success", text: `已将版本 ${target.version} 恢复并发布为版本 ${result.version}` })
        router.refresh()
      } catch {
        const message = "恢复请求未完成，请检查网络后重试"
        setModalError(message)
        setStatus({ tone: "error", text: message })
      }
    })
  }

  const publishChanges = [
    draft.totalMembers !== published.totalMembers ? `总人数：${published.totalMembers} → ${draft.totalMembers}` : null,
    draft.totalSchools !== published.totalSchools ? `学校总数：${published.totalSchools} → ${draft.totalSchools}` : null,
    changedSchoolDetails(published, draft) ? "精选学校名称、人数或顺序有调整" : null,
  ].filter((item): item is string => Boolean(item))

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.85fr)]">
        <form className="min-w-0 space-y-5" onSubmit={requestPublish} noValidate>
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="homepage-stats-summary-title">
            <div className="mb-4 flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UsersRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="homepage-stats-summary-title" className="font-semibold text-foreground">公开统计数字</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">总人数显示在图例右上方；学校总数显示在圆环中心，两者独立填写。</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label htmlFor="homepage-total-members">
                <span className="mb-1.5 block text-sm font-medium text-foreground">总人数</span>
                <input
                  id="homepage-total-members"
                  type="number"
                  min={0}
                  max={MAX_INT}
                  step={1}
                  inputMode="numeric"
                  value={Number.isNaN(draft.totalMembers) ? "" : draft.totalMembers}
                  disabled={pending}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber
                    setStatus(null)
                    setDraft((current) => ({ ...current, totalMembers: value }))
                  }}
                  aria-invalid={totalMembersInvalid}
                  aria-errormessage={totalMembersInvalid ? "homepage-validation-errors" : undefined}
                  className={INPUT_CLASS}
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">精选学校人数加“其他”人数的总和</span>
              </label>
              <label htmlFor="homepage-total-schools">
                <span className="mb-1.5 block text-sm font-medium text-foreground">学校总数</span>
                <input
                  id="homepage-total-schools"
                  type="number"
                  min={0}
                  max={MAX_INT}
                  step={1}
                  inputMode="numeric"
                  value={Number.isNaN(draft.totalSchools) ? "" : draft.totalSchools}
                  disabled={pending}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber
                    setStatus(null)
                    setDraft((current) => ({ ...current, totalSchools: value }))
                  }}
                  aria-invalid={totalSchoolsInvalid}
                  aria-errormessage={totalSchoolsInvalid ? "homepage-validation-errors" : undefined}
                  className={INPUT_CLASS}
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">圆环中心显示的全部学校数量</span>
              </label>
            </div>
          </section>

          <section aria-labelledby="homepage-featured-schools-title" className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="homepage-featured-schools-title" className="font-semibold text-foreground">精选学校</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{draft.featuredSchools.length}/{MAX_FEATURED_SCHOOLS}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">拖动排序，或使用每行的上下按钮；颜色会按照最终顺序自动分配。</p>
              </div>
              <Button type="button" variant="outline" disabled={pending || draft.featuredSchools.length >= MAX_FEATURED_SCHOOLS} onClick={addSchool}>
                <Plus aria-hidden="true" />新增学校
              </Button>
            </div>

            <div className="space-y-3">
              {draft.featuredSchools.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">暂未设置精选学校</p>
                  <p className="mt-1 text-xs text-muted-foreground">当前总人数会全部归入“其他”，也可以随时新增精选学校。</p>
                </div>
              ) : null}
              {draft.featuredSchools.map((school, index) => (
                <HomepageSchoolRow
                  key={school.id}
                  school={school}
                  index={index}
                  total={draft.featuredSchools.length}
                  pending={pending}
                  invalidFields={invalidSchoolFields.get(school.id) ?? { zh: false, ja: false, count: false }}
                  onChange={(patch) => updateSchool(school.id, patch)}
                  onMove={(direction) => moveSchool(index, direction)}
                  onDelete={() => removeSchool(school.id)}
                  onDragStart={(event: DragEvent<HTMLElement>) => {
                    setDraggedId(school.id)
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", school.id)
                  }}
                  onDragOver={(event: DragEvent<HTMLElement>) => {
                    if (!pending) {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = "move"
                    }
                  }}
                  onDrop={(event: DragEvent<HTMLElement>) => {
                    event.preventDefault()
                    dropSchool(school.id)
                  }}
                  onDragEnd={() => setDraggedId(null)}
                />
              ))}
            </div>
          </section>

          <section className={`rounded-xl border p-4 shadow-sm sm:p-5 ${otherCount < 0 ? "border-destructive/40 bg-destructive/5" : "border-primary/20 bg-primary/5"}`} aria-labelledby="homepage-other-count-title">
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${otherCount < 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                <Sigma className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="homepage-other-count-title" className="font-semibold text-foreground">“其他”自动计算</h2>
                  <p className={`text-2xl font-semibold tabular-nums ${otherCount < 0 ? "text-destructive" : "text-primary"}`}>{otherCount} 人</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">总人数 {Number.isFinite(draft.totalMembers) ? draft.totalMembers : "—"} − 精选学校合计 {featuredCount}</p>
                {otherCount === 0 ? <p className="mt-1 text-xs text-amber-700">“其他”仍会保留在图例中，但不会占据扇形面积。</p> : null}
              </div>
            </div>
          </section>

          {validationErrors.length > 0 ? (
            <section id="homepage-validation-errors" aria-live="polite" aria-labelledby="homepage-validation-title" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" aria-hidden="true" /><h2 id="homepage-validation-title">发布前需要修正</h2></div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validationErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </section>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary" role="status">
              <CheckCircle2 className="size-4" aria-hidden="true" />数据校验通过，可以发布。
            </p>
          )}

          <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,.06)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className={`text-sm font-medium ${isDirty ? "text-amber-700" : "text-muted-foreground"}`}>{isDirty ? "有尚未发布的修改" : `当前为版本 ${currentVersion}`}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">最近发布：{formatDate(published.publishedAt)}（日本时间）</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={pending || !isDirty} onClick={() => { setDraft(toDraft(published)); setStatus(null) }}>
                <RotateCcw aria-hidden="true" />放弃修改
              </Button>
              <Button type="submit" disabled={!canPublish}>
                <Save aria-hidden="true" />{pending ? "处理中" : "保存并发布"}
              </Button>
            </div>
          </div>
        </form>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <HomepageStatsPreview stats={previewDraft} />
        </aside>
      </div>

      {status ? (
        <p role={status.tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${status.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          {status.text}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{sortAnnouncement}</p>

      <HomepageStatsHistory items={history} currentVersion={currentVersion} pending={pending} onRestore={(item) => { setModalError(null); setRestoreTarget(item) }} />

      <Dialog open={publishDialogOpen} onOpenChange={(open) => { if (!pending) { setPublishDialogOpen(open); if (!open) setModalError(null) } }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>确认发布主页统计</DialogTitle>
            <DialogDescription>发布后，新访问或刷新主页的用户会立即看到这些数字和扇形比例。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-medium text-muted-foreground">本次变化</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {publishChanges.map((change) => <li key={change}>{change}</li>)}
              </ul>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">系统会保存当前版本的完整快照，之后可以从发布历史恢复。</p>
            {modalError ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{modalError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setPublishDialogOpen(false); setModalError(null) }}>取消</Button>
            <Button type="button" disabled={pending} onClick={publish}><Save aria-hidden="true" />{pending ? "发布中" : "确认发布"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreTarget != null} onOpenChange={(open) => { if (!pending && !open) { setRestoreTarget(null); setModalError(null) } }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>恢复并发布历史版本</DialogTitle>
            <DialogDescription>恢复不会删除后续记录，而是以历史数据创建一个新的当前版本。</DialogDescription>
          </DialogHeader>
          {restoreTarget ? (
            <div className="space-y-3 py-1">
              {isDirty ? <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />当前未发布的编辑会被恢复版本覆盖。</p> : null}
              <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 p-3 text-center">
                <div><dt className="text-xs text-muted-foreground">目标版本</dt><dd className="mt-1 font-semibold">{restoreTarget.version}</dd></div>
                <div><dt className="text-xs text-muted-foreground">总人数</dt><dd className="mt-1 font-semibold">{restoreTarget.totalMembers}</dd></div>
                <div><dt className="text-xs text-muted-foreground">学校总数</dt><dd className="mt-1 font-semibold">{restoreTarget.totalSchools}</dd></div>
              </dl>
              {restoreTarget.featuredSchools.length > 0 ? (
                <ul className="grid gap-1.5 rounded-lg border border-border p-3 sm:grid-cols-2">
                  {restoreTarget.featuredSchools.map((school) => (
                    <li key={school.id} className="flex min-w-0 justify-between gap-2 text-xs"><span className="truncate">{school.zh} / <span lang="ja">{school.ja}</span></span><span className="shrink-0 font-medium">{school.count} 人</span></li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">该版本没有精选学校，全部人数归入“其他”。</p>
              )}
              {modalError ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{modalError}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setRestoreTarget(null); setModalError(null) }}>取消</Button>
            <Button type="button" disabled={pending} onClick={restore}><RotateCcw aria-hidden="true" />{pending ? "恢复中" : "恢复并发布"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
