"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Check, CheckCircle, Download, GripVertical, Link2Off, LockKeyhole, LockKeyholeOpen, RefreshCw, Search, Undo2, Users, UserRound, XCircle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { getBoardGroupTimeCandidates } from "@/lib/matching/board-group-time-options"
import { MatchingBoardGroups } from "./MatchingBoardGroups"
import { MatchingBoardSmallGroups } from "./MatchingBoardSmallGroups"
import { useSmallGroupRecommendations } from "./use-small-group-recommendations"
import { availableSmallGroups, moveSmallGroupCandidate } from "./matching-small-group-local"
import { getBoardTimeOptions } from "@/lib/matching/board-time-options"
import { cn } from "@/lib/utils"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { loadMatchingBoard, inspectBoardPair, inspectBoardMultiMove, inspectBoardGroup, inspectBoardGroupMove, inspectBoardSmallGroupCandidates, rematchBoard, saveBoard, setBoardMemberLock } from "@/app/admin/matching/[id]/board-actions"
import { confirmSession, unpublishSession, lockPair, unlockPair } from "@/app/admin/matching/[id]/actions"
import { recoverMatchingAdjustment } from "@/app/admin/matching/[id]/manual-actions"
import type { BoardActionResult, BoardDraft, BoardDisplayRow, BoardSnapshot, BoardMemberLockRequest, BoardSmallGroupRecommendation } from "@/lib/matching/board-types"
import type { EnrichedMatchResult, EnrichedMember } from "./match-detail-types"
import type { MatchSessionViewProps } from "./MatchSessionView"
import { MatchingBoardDetails } from "./MatchingBoardDetails"
import { MatchingAdjustmentRecords } from "./MatchingAdjustmentRecords"
import { ScoreBreakdownChart } from "./ScoreBreakdownChart"
import { TimeSlotHeatmap } from "./TimeSlotHeatmap"
import { UnmatchedDiagnostics } from "./UnmatchedDiagnostics"
import { adjustmentRequestStorage, releaseFailedMatchingAdjustmentRequest } from "./matching-adjustment-request"
import { boardMatchedCount, moveBoardMember, splitBoardDuo } from "./matching-board-local"

export function fallbackBoard(props: MatchSessionViewProps): BoardSnapshot {
  const active = props.results.filter((r) => r.status !== "cancelled")
  const duos = active.filter((r) => !r.group_members?.length && r.member_a && r.member_b).map((r) => ({ key: r.id, resultId: r.id, memberIds: [r.member_a!.id, r.member_b!.id] as [string, string], bestSlot: r.best_slot }))
  const groups = active.filter((r) => r.group_members?.length)
  const group = groups[0]
  const occupied = new Set([...duos.flatMap((r) => r.memberIds), ...groups.flatMap((r) => r.group_members ?? [])])
  const ids = new Set([...occupied, ...props.diagnostics.map((d) => d.member_id), ...props.results.flatMap((r) => [r.member_a?.id, r.member_b?.id, ...(r.group_members ?? [])].filter((id): id is string => !!id))])
  return { draft: { duos, multi: groups.length === 1 ? { key: group.id, resultId: group.id, memberIds: group.group_members!, bestSlot: group.best_slot } : null, ...(groups.length > 1 ? { multiMode: "grouped" as const, multiGroups: groups.map((r) => ({ key: r.id, resultId: r.id, memberIds: r.group_members!, bestSlot: r.best_slot })) } : {}), waitingDuoIds: [], brokenPairs: [], unmatchedIds: [...ids].filter((id) => !occupied.has(id)) },
    revisionToken: "", lockedMemberIds: [], lockedResultIds: active.filter((r) => r.status === "locked").map((r) => r.id), cohortMemberIds: [...ids], canViewRaw: props.canViewRawSubmissions ?? false,
    rows: active.map((r) => ({ key: r.id, resultId: r.id, status: r.status, member_a_id: r.member_a?.id ?? "", member_b_id: r.member_b?.id ?? null, group_members: r.group_members, best_slot: r.best_slot, total_score: r.total_score, score_breakdown: r.score_breakdown, rank: r.rank ?? 0, game_type: r.group_members?.length ? "多人" : "双人" })) }
}

type Version = { draft: BoardDraft; rows: BoardDisplayRow[] }
type PendingSave = { sessionId: string; draft: BoardDraft; expectedRevision: string; operationId: string; reason: string }
type Pool = "duo" | "multi" | "unmatched"
const memberGenderColors = (gender: string | null | undefined) => gender === "female"
  ? "border-pink-200 bg-pink-50 hover:border-pink-300 hover:bg-pink-100 dark:border-pink-900 dark:bg-pink-950/40 dark:hover:bg-pink-950/60"
  : gender === "male"
    ? "border-sky-200 bg-sky-50 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:hover:bg-sky-950/60"
    : "border-slate-200 bg-slate-100 hover:border-slate-300 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
const formatSlot = (value: string | null) => value?.replaceAll("_", " ") ?? "待选择共同时间"

export function MatchingBoardView(props: MatchSessionViewProps) {
  const { session, results, diagnostics, candidates, submissionPrefs = {}, canViewRawSubmissions = false, initialAdjustments = [], adjustmentsUnavailable = false, readOnly = false, boardMembers = [] } = props
  const [snapshot, setSnapshot] = useState(() => props.boardSnapshot ?? fallbackBoard(props))
  const router = useRouter()
  const [version, setVersion] = useState<Version>(() => ({ draft: snapshot.draft, rows: snapshot.rows }))
  const [history, setHistory] = useState<Version[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [reason, setReason] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [reloadNeeded, setReloadNeeded] = useState(false)
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [pendingMemberLock, setPendingMemberLock] = useState<BoardMemberLockRequest | null>(null)
  const [pairPreview, setPairPreview] = useState<{ response: BoardActionResult; ids: [string, string] } | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [excludedCandidates, setExcludedCandidates] = useState<Record<string, string[]>>({})
  const inFlight = useRef(false)
  const saved = useRef(false)
  const pointer = useRef<{ id: string; instance: string; timer: ReturnType<typeof setTimeout>; started: boolean; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const draft = version.draft
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.draft)
  const pendingOperation = !!pendingSave || !!pendingMemberLock
  const dirtyRef = useRef(dirty)
  useEffect(() => { dirtyRef.current = dirty || pendingOperation }, [dirty, pendingOperation])
  const mutable = !readOnly && session.status === "draft" && session.results_ready === true && !!snapshot.revisionToken
  const editable = mutable && desktop && !busy && !pendingOperation && !reloadNeeded
  const canRecommend = mutable && canViewRawSubmissions && snapshot.canViewRaw
  const poolLocked = !!draft.multi?.resultId && snapshot.lockedResultIds.includes(draft.multi.resultId)
  const small = useSmallGroupRecommendations(
    { sessionId: session.id, draft, expectedRevision: snapshot.revisionToken }, canRecommend,
    busy || dirty || pendingOperation || reloadNeeded || poolLocked,
  )
  const currentPrefs = snapshot.currentSubmissionPrefs ?? submissionPrefs
  const smallSuggestions = availableSmallGroups(small.recommendations, draft.multi?.memberIds ?? [], currentPrefs)
  const reasonValid = adminAuditReasonIsValid(reason)
  const initialRows = useRef(snapshot.rows)
  const memberLockStorageKey = `matching-board-member-lock:${session.id}`
  const storageKey = `matching-board-save:${session.id}`

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px) and (pointer: fine)")
    const update = () => setDesktop(media.matches)
    update(); media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(storageKey)
      if (pending) {
        const value = JSON.parse(pending) as PendingSave
        if (value.sessionId === session.id && value.operationId && value.draft && value.expectedRevision) {
          setPendingSave(value)
          setVersion({ draft: value.draft, rows: initialRows.current })
          setError("上次保存结果待确认。请点击「核对上次保存」，沿用原编号核对后继续编辑。")
        }
      }
    } catch { /* Storage may be disabled; retries remain available in this tab. */ }
  }, [storageKey, session.id])
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(memberLockStorageKey)
      if (!raw) return
      const value = JSON.parse(raw) as BoardMemberLockRequest
      if (value.sessionId === session.id && typeof value.memberId === "string" && typeof value.locked === "boolean" && value.operationId && value.expectedRevision) {
        setPendingMemberLock(value)
        setError("上次个人锁定状态待确认，请点击「核对个人锁定」后继续编辑。")
      }
    } catch { /* The in-memory request remains available when storage is disabled. */ }
  }, [memberLockStorageKey, session.id])
  useEffect(() => {
    const shouldWarn = () => !saved.current && dirtyRef.current
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (shouldWarn()) { event.preventDefault(); event.returnValue = "" }
    }
    const ask = () => !shouldWarn() || window.confirm("还有未保存或待确认的调整，离开将丢失未保存的编辑。确定离开？")
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey || anchor.origin !== location.origin) return
      if (anchor.pathname !== location.pathname && !ask()) { event.preventDefault(); event.stopPropagation() }
    }
    // Navigation API also covers browser back/forward in supporting browsers.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    const navigate = (event: Event) => {
      const target = event as Event & { destination?: { url: string }; userInitiated?: boolean }
      if (target.cancelable && target.userInitiated && target.destination && new URL(target.destination.url).pathname !== location.pathname && !ask()) target.preventDefault()
    }
    window.addEventListener("beforeunload", beforeUnload)
    if (navigation) navigation.addEventListener("navigate", navigate)
    else document.addEventListener("click", click, true)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      navigation?.removeEventListener("navigate", navigate)
      document.removeEventListener("click", click, true)
    }
  }, [])
  useEffect(() => () => { if (pointer.current) clearTimeout(pointer.current.timer) }, [])

  const members = useMemo(() => {
    const map = new Map<string, EnrichedMember>()
    for (const row of results) for (const member of [row.member_a, row.member_b, ...(row.group_member_details ?? [])]) if (member) map.set(member.id, member)
    for (const item of diagnostics) if (item.memberData) map.set(item.memberData.id, item.memberData)
    for (const member of props.poolMembers ?? []) if (member.memberData) map.set(member.id, member.memberData)
    for (const member of boardMembers) map.set(member.id, member)
    return map
  }, [results, diagnostics, props.poolMembers, boardMembers])
  const name = (id: string) => members.get(id)?.member_identity?.full_name || members.get(id)?.member_identity?.nickname || props.allMemberOptions?.find((m) => m.id === id)?.name || `成员 ${id.slice(0, 6)}`
  const member = (id: string): EnrichedMember => members.get(id) ?? { id, record_source: null, member_identity: { full_name: name(id), nickname: null, school_name: null, gender: "", hobby_tags: [], nationality: "", degree_level: null, department: null }, member_interests: null, member_personality: null, member_boundaries: null }
  const visible = (ids: string[]) => !query.trim() || ids.some((id) => name(id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const duoOf = (id: string) => draft.duos.find((row) => row.memberIds.includes(id))
  const groupOf = (id: string) => draft.multiGroups?.find((group) => group.memberIds.includes(id))
  const pinned = (id: string) => (snapshot.lockedMemberIds ?? []).includes(id)
  const connectionLocked = (ids: [string, string]) => locked(ids[0]) || ids.every(pinned)
  const locked = (id: string) => {
    const row = duoOf(id) ?? groupOf(id) ?? (draft.multi?.memberIds.includes(id) ? draft.multi : null)
    return !!row?.resultId && snapshot.lockedResultIds.includes(row.resultId)
  }
  const apply = (next: BoardDraft, rows = version.rows) => {
    if (JSON.stringify(next) === JSON.stringify(draft)) return
    saved.current = false
    setHistory((old) => [...old, version].slice(-100))
    setVersion({ draft: next, rows })
    setSelected([]); setOpenedId(null); setExcludedCandidates({}); setError("")
  }
  const request = () => ({ sessionId: session.id, draft, expectedRevision: snapshot.revisionToken })
  const run = async (task: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(""); setNotice("")
    try { await task() } catch { setError("操作暂未完成，请重试；当前编辑仍保留。") }
    finally { inFlight.current = false; setBusy(false) }
  }
  const choosePair = (ids: [string, string]) => {
    if (!editable) return
    void run(async () => {
      const response = await inspectBoardPair({ ...request(), memberIds: ids })
      if (response.error || !response.passed || !response.draft) { setError(response.error || response.reasons?.join("；") || "这两位成员不符合配对条件"); return }
      setPairPreview({ response, ids }); setOpenedId(null)
    })
  }
  const move = (id: string, target: Pool) => {
    if (!editable || locked(id)) return
    if (pinned(id) && target !== "duo") { setError("此人已锁定在双人本池子，请先解除个人锁定再移池。"); return }
    if (duoOf(id)) { setError("请先点击两人之间的 & 取消原配对，再移动成员。"); return }
    if (target === "multi") {
      if (draft.multi?.memberIds.includes(id)) return
      void run(async () => {
        const response = await inspectBoardMultiMove({ ...request(), memberId: id })
        if (!response.draft) { setError(response.error || "暂时不能移入多人池"); return }
        apply(response.draft, response.rows ?? version.rows)
        setNotice(response.passed ? `${name(id)} 已加入多人池，等待保存。` : `${name(id)} 未满足多人池条件，已放入未匹配池。${response.reasons?.join("；") ?? ""}`)
      })
    } else {
      try { apply(moveBoardMember(draft, id, target)); setNotice(`${name(id)} 已移入${target === "duo" ? "双人池等待搭档" : "未匹配池"}，等待保存。`) }
      catch (err) { setError(err instanceof Error ? err.message : "无法移动成员") }
    }
  }
  const createGroup = (slot: string, memberIds: string[], groupKind?: "small") => {
    if (!editable || memberIds.length < 3 || memberIds.some(locked)) return
    if (groupKind === "small" && (memberIds.length < 4 || memberIds.length > 6)) return
    void run(async () => {
      const response = await inspectBoardGroup({ ...request(), memberIds, slot, ...(groupKind ? { groupKind } : {}) })
      if (response.error || !response.passed || !response.draft) { setError(response.error || response.reasons?.join("；") || "这些成员暂不能组成小组"); return }
      apply(response.draft, response.rows ?? version.rows)
      setNotice(`已确认 ${memberIds.length} 人小组，其他候选时段已移除这些成员。保存后生效。`)
    })
  }
  const confirmSmallGroup = (group: BoardSmallGroupRecommendation) => {
    const current = smallSuggestions.find((suggestion) => suggestion.key === group.key)
    if (current) createGroup(current.bestSlot, current.memberIds, "small")
  }
  const removeSmallCandidate = (key: string, id: string) => {
    if (!editable || poolLocked || small.loading) return
    small.setRecommendations((groups) => groups.map((group) => group.key === key ? { ...group, memberIds: group.memberIds.filter((memberId) => memberId !== id) } : group).filter((group) => group.memberIds.length > 0))
    setNotice(`${name(id)} 已移出本组推荐，仍在上方候选池中。`)
  }
  const moveToSmallSuggestion = (id: string, key: string) => {
    if (!editable || poolLocked || small.loading) return
    if (!draft.multi?.memberIds.includes(id)) { setError("请先将此人移回上方多人候选池，再加入推荐小组。"); return }
    let next: BoardSmallGroupRecommendation[]
    try { next = moveSmallGroupCandidate(smallSuggestions, id, key, currentPrefs) }
    catch (err) { setError(err instanceof Error ? err.message : "无法调整推荐小组"); return }
    const target = next.find((group) => group.key === key)
    if (!target || smallSuggestions.find((group) => group.key === key)?.memberIds.includes(id)) return
    void run(async () => {
      const response = await inspectBoardSmallGroupCandidates({ ...request(), memberIds: target.memberIds, slot: target.bestSlot })
      if (response.error || !response.passed) { setError(response.error || response.reasons?.join("；") || "此人不满足该推荐组的匹配条件。"); return }
      small.setRecommendations(next)
      setNotice("已调整推荐分组；人数恢复为4–6人后可确认，其他建议保持原位。")
    })
  }
  const moveToGroup = (id: string, groupKey: string) => {
    if (!editable || locked(id)) return
    if (pinned(id)) { setError("此人已锁定在双人本池子，请先解除个人锁定再移池。"); return }
    if (duoOf(id)) { setError("请先点击两人之间的 & 取消原配对，再移动成员。"); return }
    if (groupOf(id)?.key === groupKey) return
    void run(async () => {
      const response = await inspectBoardGroupMove({ ...request(), memberId: id, groupKey })
      if (response.error || !response.passed || !response.draft) { setError(response.error || response.reasons?.join("；") || "此人不符合该组的时间或匹配条件"); return }
      apply(response.draft, response.rows ?? version.rows)
      setNotice(`${name(id)} 已移入小组，等待保存。`)
    })
  }
  const toggleCandidate = (slot: string, id: string, included: boolean) => {
    if (!editable) return
    setExcludedCandidates((current) => ({ ...current, [slot]: included ? (current[slot] ?? []).filter((value) => value !== id) : [...new Set([...(current[slot] ?? []), id])] }))
  }
  const split = (id: string) => {
    const duo = duoOf(id)
    if (!editable || !duo || connectionLocked(duo.memberIds)) return
    apply(splitBoardDuo(draft, duo.key)); setNotice("配对已解除，两人留在原处，可分别移动。保存后生效。")
  }
  const restoreConnection = (ids: [string, string], originalKey: string) => {
    if (!editable) return
    void run(async () => {
      const response = await inspectBoardPair({ ...request(), memberIds: ids })
      if (response.error || !response.passed || !response.draft) { setError(response.error || response.reasons?.join("；") || "当前不满足配对条件，原解除状态保留。"); return }
      // Keep the visual row in place while retaining the newly checked result and score.
      const restored = response.draft.duos.find((duo) => ids.every((id) => duo.memberIds.includes(id)))
      const restoredKey = restored?.key
      const next = { ...response.draft, duos: response.draft.duos.map((duo) => duo.key === restoredKey ? { ...duo, key: originalKey } : duo) }
      const rows = (response.rows ?? version.rows).map((row) => row.key === restoredKey ? { ...row, key: originalKey } : row)
      apply(next, rows)
      setNotice("已通过兼容性检查并恢复配对，等待保存。")
    })
  }
  const changeMemberLock = (id?: string) => {
    if ((!mutable && !pendingMemberLock) || !desktop || busy || pendingSave || reloadNeeded) return
    if (dirty && !pendingMemberLock) { setError("请先保存或撤销当前调整，再更改个人锁定。"); return }
    const payload = pendingMemberLock ?? (id ? { sessionId: session.id, memberId: id, locked: !pinned(id), expectedRevision: snapshot.revisionToken, operationId: crypto.randomUUID() } : null)
    if (!payload) return
    void run(async () => {
      setPendingMemberLock(payload)
      try { sessionStorage.setItem(memberLockStorageKey, JSON.stringify(payload)) } catch {}
      let response: BoardActionResult
      try { response = await setBoardMemberLock(payload) }
      catch { setError("个人锁定结果待确认，请点击「核对个人锁定」沿用原编号重试。"); return }
      if (!response.success) {
        setError(response.error || "暂时无法更改个人锁定。")
        if (!response.unknown) { setPendingMemberLock(null); try { sessionStorage.removeItem(memberLockStorageKey) } catch {} }
        return
      }
      let fresh: BoardSnapshot
      try { fresh = await loadMatchingBoard(session.id) }
      catch { setError("个人锁定已更新，但暂时无法读取新状态。请点击「核对个人锁定」重新载入。"); return }
      setSnapshot(fresh); setVersion({ draft: fresh.draft, rows: fresh.rows }); setHistory([]); setSelected([]); setOpenedId(null)
      setPendingMemberLock(null); dirtyRef.current = false
      try { sessionStorage.removeItem(memberLockStorageKey) } catch {}
      setNotice(payload.locked ? "已将此人锁定在双人本池子；双方都锁定时保留配对关系。" : "已解除此人的双人池锁定。")
      router.refresh()
    })
  }
  const rerun = () => {
    if (!editable) return
    void run(async () => {
      const response = await rematchBoard(request())
      if (response.error || !response.draft) { setError(response.error || "本次重新匹配未完成"); return }
      apply(response.draft, response.rows ?? version.rows)
      setNotice(`已检查未匹配池，剩余 ${response.draft.unmatchedIds.length} 人。现有配对与多人池时间保留；请检查后保存。`)
    })
  }
  const persist = () => {
    if ((!mutable && !pendingSave) || !desktop || reloadNeeded || pendingMemberLock || (!pendingSave && (!dirty || !reasonValid))) return
    void run(async () => {
      const payload = pendingSave ?? { ...request(), operationId: crypto.randomUUID(), reason }
      setPendingSave(payload)
      try { sessionStorage.setItem(storageKey, JSON.stringify(payload)) } catch { /* In-memory retry remains possible. */ }
      let response: BoardActionResult
      try { response = await saveBoard(payload) }
      catch { setError("保存结果待确认，请点击「核对上次保存」沿用原编号重试。"); return }
      if (!response.success) {
        setError(response.error || "保存未完成，当前编辑仍保留。")
        if (!response.unknown) { setPendingSave(null); try { sessionStorage.removeItem(storageKey) } catch {} }
        return
      }
      let fresh: BoardSnapshot
      try { fresh = await loadMatchingBoard(session.id) }
      catch { setError("调整已保存，但暂时无法载入更新后的方案。请点击「核对上次保存」重新载入。"); return }
      setSnapshot(fresh); setVersion({ draft: fresh.draft, rows: fresh.rows })
      saved.current = false; dirtyRef.current = false
      setPendingSave(null); setHistory([]); setSelected([]); setOpenedId(null)
      try { sessionStorage.removeItem(storageKey) } catch {}
      setNotice("调整已保存，正在更新页面。")
      router.refresh()
    })
  }
  const directAction = (action: () => Promise<{ error?: string }>) => {
    if (!desktop || reloadNeeded) return
    if (dirty || pendingOperation) { setError("请先保存或撤销当前调整，再执行此操作。"); return }
    void run(async () => { const response = await action(); if (response.error) setError(response.error); else router.refresh() })
  }

  const setResultLock = (resultId: string, currentlyLocked: boolean, kind: "多人池" | "多人小组" | "整对关系") => {
    if (!editable || dirty) return
    void run(async () => {
      let result: { error?: string }
      try { result = await (currentlyLocked ? unlockPair : lockPair)(resultId, `三池子页面：${currentlyLocked ? `解除${kind}锁定` : `锁定${kind}`}`) }
      catch { setReloadNeeded(true); setError("锁定结果待确认，请重新载入方案核对最新状态。"); return }
      if (result.error) { setError(result.error); return }
      try {
        const fresh = await loadMatchingBoard(session.id)
        setSnapshot(fresh); setVersion({ draft: fresh.draft, rows: fresh.rows }); setHistory([]); setSelected([]); setOpenedId(null)
        setNotice(`${kind}${currentlyLocked ? "已解锁" : "已锁定"}。`)
      } catch { setReloadNeeded(true); setError("锁定操作已完成，请重新载入方案确认最新状态后继续编辑。"); }
      router.refresh()
    })
  }

  const reloadBoard = () => {
    if (!desktop || busy) return
    void run(async () => {
      const fresh = await loadMatchingBoard(session.id)
      setSnapshot(fresh); setVersion({ draft: fresh.draft, rows: fresh.rows }); setHistory([]); setSelected([]); setOpenedId(null)
      setReloadNeeded(false); setNotice("已重新载入方案，锁定状态已更新。")
      router.refresh()
    })
  }

  const detailResult = (ids: string[], key?: string): EnrichedMatchResult | undefined => {
    if (!key) return undefined
    const row = version.rows.find((item) => item.key === key)
    if (!row) return undefined
    const actualIds = row.group_members?.length ? row.group_members : [row.member_a_id, row.member_b_id].filter((id): id is string => !!id)
    if (actualIds.length !== ids.length || actualIds.some((id) => !ids.includes(id))) return undefined
    const active = draft.duos.some((item) => item.key === key) || draft.multi?.key === key || draft.multiGroups?.some((item) => item.key === key)
    return { id: row.resultId ?? row.key, total_score: row.total_score, best_slot: row.best_slot, rank: row.rank, status: active ? row.status ?? "draft" : "cancelled", score_breakdown: row.score_breakdown,
      member_a: member(row.member_a_id), member_b: row.member_b_id ? member(row.member_b_id) : null, group_members: row.group_members, group_member_details: row.group_members?.map(member) ?? null }
  }
  const stopPointer = () => { if (pointer.current) clearTimeout(pointer.current.timer); pointer.current = null; setDrag(null); setOver(null) }
  const pointerDown = (event: ReactPointerEvent<HTMLElement>, id: string, instance: string) => {
    if (!editable || event.button !== 0 || duoOf(id) || locked(id)) return
    suppressClick.current = false
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    const state = { id, instance, started: false, x: event.clientX, y: event.clientY, timer: setTimeout(() => {
      state.started = true; suppressClick.current = true; setOpenedId(null); setDrag({ id, x: state.x, y: state.y })
    }, 350) }
    pointer.current = state
  }
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = pointer.current
    if (!current) return
    if (!current.started && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) { stopPointer(); return }
    if (!current.started) return
    event.preventDefault()
    setDrag({ id: current.id, x: event.clientX, y: event.clientY })
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    const pool = hit?.closest<HTMLElement>("[data-board-drop-pool]")
    const group = hit?.closest<HTMLElement>("[data-board-group-key]")?.dataset.boardGroupKey
    const slot = hit?.closest<HTMLElement>("[data-board-time-slot]")?.dataset.boardTimeSlot
    const smallKey = hit?.closest<HTMLElement>("[data-board-small-key]")?.dataset.boardSmallKey
    setOver(group ? `group:${group}` : smallKey ? `small:${smallKey}` : slot ? `time:${slot}` : pool?.dataset.boardDropPool ?? null)
    const scroll = hit?.closest<HTMLElement>("[data-board-scroll]") ?? pool?.querySelector<HTMLElement>("[data-board-scroll]")
    if (scroll) {
      const rect = scroll.getBoundingClientRect()
      if (event.clientY < rect.top + 40) scroll.scrollBy(0, -18)
      if (event.clientY > rect.bottom - 40) scroll.scrollBy(0, 18)
    }
  }
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = pointer.current
    if (!current) return
    const didDrag = current.started
    const hit = didDrag ? document.elementFromPoint(event.clientX, event.clientY) : null
    const other = hit?.closest<HTMLElement>("[data-board-drop-member]")?.dataset.boardDropMember
    const pool = hit?.closest<HTMLElement>("[data-board-drop-pool]")?.dataset.boardDropPool as Pool | undefined
    const groupKey = hit?.closest<HTMLElement>("[data-board-group-key]")?.dataset.boardGroupKey
    const slot = hit?.closest<HTMLElement>("[data-board-time-slot]")?.dataset.boardTimeSlot
    const smallKey = hit?.closest<HTMLElement>("[data-board-small-key]")?.dataset.boardSmallKey
    stopPointer()
    if (!didDrag) return
    event.preventDefault()
    if (groupKey) moveToGroup(current.id, groupKey)
    else if (smallKey) moveToSmallSuggestion(current.id, smallKey)
    else if (slot) {
      const option = groupTimes.candidates.find((candidate) => candidate.slot === slot)
      if (!option?.memberIds.includes(current.id)) setError("此人不在该时段的待分组候选中，请先移回上方人员池并核对可用时间。")
      else {
        toggleCandidate(slot, current.id, true)
        if (current.instance.startsWith("candidate:") && current.instance !== `candidate:${slot}`) toggleCandidate(current.instance.slice(10), current.id, false)
        setNotice("已调整此时段的候选选择；点击「确认分组」后才会组成正式小组。")
      }
    }
    else if (pool === "multi" && current.instance.startsWith("small:")) removeSmallCandidate(current.instance.slice(6), current.id)
    else if (pool === "multi" && current.instance.startsWith("candidate:")) toggleCandidate(current.instance.slice(10), current.id, false)
    else if (other && other !== current.id && pool === "duo") choosePair([current.id, other])
    else if (pool && other !== current.id) move(current.id, pool)
    setTimeout(() => { suppressClick.current = false }, 0)
  }

  const chip = (id: string, pairIds?: [string, string], key?: string, instance = "pool", candidate = false) => {
    const duo = duoOf(id)
    const comparison = pairIds ?? duo?.memberIds ?? [id]
    const rowKey = key ?? duo?.key ?? groupOf(id)?.key
    const instanceId = `${instance}:${id}`
    const isLocked = locked(id)
    const free = !duo && !isLocked
    const isDuoMember = !!duo || draft.waitingDuoIds.includes(id)
    const details = detailResult(comparison, rowKey)
    return <div key={id} className="inline-flex max-w-full items-center gap-1" data-board-drop-member={id}>
      {editable && free && !candidate && <input type="checkbox" aria-label={`选择 ${name(id)}`} checked={selected.includes(id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, id].slice(-2) : old.filter((memberId) => memberId !== id))} className="size-3.5 accent-primary" />}
      <Popover open={openedId === instanceId} onOpenChange={(open) => { if (!suppressClick.current && !drag) setOpenedId(open ? instanceId : null) }}>
        <PopoverTrigger data-member-id={id} onPointerDown={(event) => pointerDown(event, id, instance)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={stopPointer}
          onClick={(event) => { if (suppressClick.current) event.preventDefault() }}
          className={cn("inline-flex min-h-10 max-w-full select-none items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary", memberGenderColors(member(id).member_identity?.gender), selected.includes(id) && "ring-2 ring-primary ring-offset-2", drag?.id === id && "opacity-40", editable && free && "cursor-grab")}
          aria-label={`查看 ${name(id)}${comparison.length === 2 ? "及搭档的资料" : "的资料"}`}>
          {isLocked ? <LockKeyhole className="size-3 text-muted-foreground" /> : editable && free ? <GripVertical className="size-3 text-muted-foreground" /> : null}
          <span className="truncate">{name(id)}</span>
        </PopoverTrigger>
        <PopoverContent className={cn("z-50 w-[min(760px,calc(100vw-2rem))] p-0", comparison.length === 1 && "w-[min(440px,calc(100vw-2rem))]")}>
          <MatchingBoardDetails members={comparison.map(member)} submissionPrefs={snapshot.currentSubmissionPrefs ?? submissionPrefs} canViewRawSubmissions={canViewRawSubmissions} sourceNote={snapshot.currentSubmissionPrefs ? "当前报名资料（打开页面时读取）；保存时会再次核验。" : "原批资料快照或成员档案；新调整会重新核验当前报名资料。"} result={details} onClose={() => setOpenedId(null)} />
          {mutable && desktop && <div className="flex flex-wrap gap-2 border-t bg-muted/20 p-3">
            {duo && <Button size="sm" variant="outline" disabled={!editable || connectionLocked(duo.memberIds)} onClick={() => split(id)}><Link2Off className="size-3.5" />取消匹配</Button>}
            {free && <>
              <Button size="sm" variant="outline" disabled={!editable} onClick={() => move(id, "duo")}>移至双人池</Button>
              <Button size="sm" variant="outline" disabled={!editable || pinned(id)} onClick={() => move(id, "multi")}>移至多人池</Button>
              <Button size="sm" variant="outline" disabled={!editable || pinned(id)} onClick={() => move(id, "unmatched")}>移至未匹配池</Button>
            </>}
            {free && (draft.multiGroups?.length ?? 0) > 0 && <label className="flex items-center gap-2 text-xs">移入小组
              <select aria-label={`将 ${name(id)}移入小组`} value="" disabled={!editable || pinned(id)} className="max-w-56 rounded-md border bg-background px-2 py-1.5" onChange={(event) => { if (event.target.value) moveToGroup(id, event.target.value) }}>
                <option value="">选择目标小组</option>{draft.multiGroups?.map((group) => <option key={group.key} value={group.key} disabled={group.memberIds.includes(id) || (!!group.resultId && snapshot.lockedResultIds.includes(group.resultId))}>{group.groupKind === "small" ? "4–6人" : "时间分组"}第 {(draft.multiGroups ?? []).filter((entry) => entry.groupKind === group.groupKind).findIndex((entry) => entry.key === group.key) + 1} 组 · {formatSlot(group.bestSlot)}</option>)}
              </select>
            </label>}
            {free && draft.multi?.memberIds.includes(id) && smallSuggestions.length > 0 && <label className="flex items-center gap-2 text-xs">调整推荐分组
              <select aria-label={`将 ${name(id)}移入推荐小组`} value="" disabled={!editable || small.loading || poolLocked} className="max-w-56 rounded-md border bg-background px-2 py-1.5" onChange={(event) => { if (event.target.value) moveToSmallSuggestion(id, event.target.value) }}>
                <option value="">选择推荐小组</option>{smallSuggestions.map((group, index) => <option key={group.key} value={group.key} disabled={group.memberIds.includes(id)}>推荐 {index + 1} · {group.memberIds.length} 人 · {formatSlot(group.bestSlot)}</option>)}
              </select>
            </label>}
            {duo?.resultId && <Button size="sm" variant="ghost" disabled={reloadNeeded || busy || dirty || pendingOperation} onClick={() => setResultLock(duo.resultId!, isLocked, "整对关系")}>{isLocked ? "解除锁定" : "锁定配对"}</Button>}
          </div>}
        </PopoverContent>
      </Popover>
      {isDuoMember && <Button size="icon-sm" variant="ghost" className={cn("shrink-0", pinned(id) ? "text-amber-700" : "text-muted-foreground/60")} aria-label={`${pinned(id) ? "解锁" : "锁定"} ${name(id)}在双人池`} aria-pressed={pinned(id)} title={dirty ? "请先保存或撤销调整，再更改个人锁定" : pinned(id) ? "此人锁定在双人池；点击解锁" : "将此人锁定在双人池（无需填写理由）"} disabled={!editable || dirty} onClick={() => changeMemberLock(id)}>{pinned(id) ? <LockKeyhole className="size-3.5" /> : <LockKeyholeOpen className="size-3.5" />}</Button>}
    </div>
  }
  const pool = (id: Pool, title: string, count: string, icon: ReactNode, subtitle: ReactNode, children: ReactNode, action?: ReactNode) => <section aria-label={title} data-board-drop-pool={id} className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-colors", over === id ? "border-primary ring-2 ring-primary/20" : "border-border")}>
    <div className="flex min-h-24 items-start justify-between gap-2 border-b bg-muted/20 px-4 py-4">
      <div><h2 className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h2><p className="mt-1 text-xs text-muted-foreground">{count}</p></div>{action}
    </div>
    <div className="border-b px-4 py-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</div>
    <div data-board-scroll className="min-h-36 space-y-3 overflow-y-auto p-4 lg:h-[min(60vh,640px)] lg:min-h-80">{children}</div>
  </section>
  const duoOrder = new Map<string, number>()
  for (const row of [...snapshot.rows, ...version.rows]) if (!duoOrder.has(row.key)) duoOrder.set(row.key, duoOrder.size)
  const duoEntries = [...draft.duos.map((row) => ({ kind: "paired" as const, row })), ...draft.brokenPairs.map((row) => ({ kind: "broken" as const, row }))]
    .sort((a, b) => (duoOrder.get(a.row.key) ?? Number.MAX_SAFE_INTEGER) - (duoOrder.get(b.row.key) ?? Number.MAX_SAFE_INTEGER))
  const brokenIds = new Set(draft.brokenPairs.flatMap((pair) => pair.memberIds))
  const matched = boardMatchedCount(draft)
  const grouped = draft.multiMode === "grouped"
  const incompleteMulti = !grouped && !!draft.multi && draft.multi.memberIds.length < 3
  const incompleteSmallGroups = !!draft.multiGroups?.some((group) => group.groupKind === "small" && (group.memberIds.length < 4 || group.memberIds.length > 6))
  const incompleteOrdinaryGroups = !!draft.multiGroups?.some((group) => group.groupKind !== "small" && group.memberIds.length < 3)
  const incompleteGroups = incompleteSmallGroups || incompleteOrdinaryGroups
  const waitingForGroups = grouped && !!draft.multi?.memberIds.length
  const groupTimes = getBoardGroupTimeCandidates(draft.multi?.memberIds ?? [], snapshot.currentSubmissionPrefs ?? submissionPrefs)
  const multiLocked = !!draft.multi?.resultId && snapshot.lockedResultIds.includes(draft.multi.resultId)
  const multiTimes = getBoardTimeOptions(draft.multi?.memberIds ?? [], snapshot.currentSubmissionPrefs ?? submissionPrefs, draft.multi?.bestSlot ?? null)
  const multiScore = draft.multi ? detailResult(draft.multi.memberIds, draft.multi.key) : undefined
  const resetDraft = () => {
    setVersion({ draft: snapshot.draft, rows: snapshot.rows }); setHistory([]); setSelected([]); setOpenedId(null); setError("")
    saved.current = false; dirtyRef.current = false
  }
  const previewRow = pairPreview?.response.rows?.find((row) => row.member_b_id && pairPreview.ids.includes(row.member_a_id) && pairPreview.ids.includes(row.member_b_id))

  return <div className="space-y-5 p-4 lg:p-6" data-testid="matching-three-pools">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-muted px-3 py-1">{snapshot.cohortMemberIds.length || session.total_candidates} 人参与</span>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">{matched} 人已匹配</span>
        <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{draft.unmatchedIds.length} 人在未匹配池</span>
        {waitingForGroups && <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-700">{draft.multi!.memberIds.length} 人待分组</span>}
        {draft.waitingDuoIds.length > 0 && <span className="rounded-full bg-muted px-3 py-1">{draft.waitingDuoIds.length} 人等待搭档</span>}
        {dirty && <span className="text-xs font-medium text-amber-700">尚未保存</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {canViewRawSubmissions && <a className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/matching/${session.id}/export`}><Download className="size-3.5" />导出 Excel</a>}
        {!readOnly && session.status === "draft" && <Button size="sm" disabled={reloadNeeded || !desktop || busy || dirty || pendingOperation || !reasonValid || !session.results_ready || waitingForGroups || incompleteGroups} onClick={() => directAction(() => confirmSession(session.id, reason, session.publication_version ?? 0))}><CheckCircle className="size-3.5" />确认发布</Button>}
        {!readOnly && session.status === "confirmed" && <Button size="sm" variant="outline" disabled={reloadNeeded || !desktop || busy || !reasonValid} onClick={() => { if (window.confirm("撤回后玩家将无法看到结果，确定撤回发布？")) directAction(() => unpublishSession(session.id, reason, session.publication_version ?? 0)) }}><XCircle className="size-3.5" />撤回发布</Button>}
      </div>
    </div>
    {!readOnly && <div className="flex flex-col gap-2 rounded-xl border bg-muted/10 p-3 lg:flex-row lg:items-center">
      <label htmlFor="board-audit-reason" className="shrink-0 text-sm font-medium">操作理由</label>
      <input id="board-audit-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy || pendingOperation} maxLength={500} placeholder="保存或发布时填写，4–500 个字符" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" />
      {mutable && <div className="hidden gap-2 lg:flex">
        <Button size="sm" variant="outline" disabled={!editable || !history.length} onClick={() => { setVersion(history[history.length - 1]); setHistory(history.slice(0, -1)); setSelected([]); setOpenedId(null); setError(""); setNotice("已撤销上一步调整。") }}><Undo2 className="size-3.5" />撤销</Button>
        <Button size="sm" variant="ghost" disabled={!editable || !dirty} onClick={() => { if (window.confirm("放弃全部未保存调整？已保存的结果不会改变。")) { resetDraft(); setNotice("已恢复到上次保存的方案。") } }}>放弃调整</Button>
        <Button size="sm" disabled={reloadNeeded || busy || !desktop || !!pendingMemberLock || (!pendingSave && (!dirty || !reasonValid || incompleteMulti || incompleteGroups))} onClick={persist}><Check className="size-3.5" />{pendingSave ? "核对上次保存" : "保存调整"}</Button>
      </div>}
    </div>}
    {session.status === "confirmed" && <p className="text-sm text-muted-foreground">结果已发布。如需调整配对，请先撤回发布；取消申请仍可在审批页面处理。</p>}
    {!session.results_ready && <p className="text-sm text-muted-foreground">匹配结果尚未生成完成，完成后才能发布。</p>}
    {props.boardUnavailable && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">暂时无法加载编辑状态，当前仅可查看。请刷新后重试。</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-relaxed text-muted-foreground">单击姓名查看资料。<span className="hidden lg:inline">点击 & 配对或解除，姓名旁的小锁固定双人池归属；长按姓名可拖动。调整完成后统一保存。</span><span className="lg:hidden">请在电脑上进行拖动与调整。</span></p>
      <div className="flex items-center gap-2">
        {mutable && <Button className="hidden lg:inline-flex" size="sm" variant="outline" disabled={!editable || selected.length !== 2} onClick={() => choosePair(selected as [string, string])}>选中两人配对{selected.length > 0 ? `（${selected.length}/2）` : ""}</Button>}
        <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><input aria-label="搜索池内成员" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名" className="w-40 rounded-lg border bg-background py-2 pl-8 pr-2 text-sm" /></div>
      </div>
    </div>
    {pendingSave && !mutable && <Button size="sm" variant="outline" disabled={busy || !desktop || !!pendingMemberLock} onClick={persist}>核对上次保存</Button>}
    {reloadNeeded && <Button size="sm" variant="outline" disabled={busy || !desktop} onClick={reloadBoard}>重新载入方案</Button>}
    {pendingMemberLock && <Button size="sm" variant="outline" disabled={busy || !desktop} onClick={() => changeMemberLock()}>核对个人锁定</Button>}
    {(error || notice || busy) && <div aria-live="polite" role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", error ? "border-red-200 bg-red-50 text-red-800" : "border-primary/20 bg-primary/5 text-primary")}>{busy ? "正在核验，请稍候…" : error || notice}</div>}
    {incompleteMulti && <p role="alert" className="text-sm text-amber-700">多人池暂有 {draft.multi!.memberIds.length} 人，至少 3 人才能保存。请继续加入成员，或将剩余成员移到其他池子。</p>}
    {waitingForGroups && <p className="text-sm text-muted-foreground">上方还有 {draft.multi!.memberIds.length} 人待分组，可以先保存草稿；发布前请完成分组，或将其移到未匹配池。</p>}
    {incompleteOrdinaryGroups && <p role="alert" className="text-sm text-amber-700">有小组不足 3 人。请补入成员，或将该组所有成员移回人员池后再保存。</p>}
    {incompleteSmallGroups && <p role="alert" className="text-sm text-amber-700">有4–6人小组的人数超出范围。请调整至4–6人，或将该组移空后再保存。</p>}
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.45fr_.85fr]">
      {pool("duo", "双人本池子", `${draft.duos.length} 对已配对 · ${draft.waitingDuoIds.length} 人待配对`, <Users className="size-4 text-primary" />, "灰线表示原配对已解除；独立姓名等待新搭档。",
        <>
          {duoEntries.filter(({ row }) => visible(row.memberIds)).map(({ kind, row }) => kind === "paired"
            ? <div key={row.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-3" data-duo-key={row.key}>{chip(row.memberIds[0], row.memberIds, row.key)}<button type="button" aria-label={`解除 ${name(row.memberIds[0])}与${name(row.memberIds[1])}的配对`} title={connectionLocked(row.memberIds) ? "请先解除整对锁定，或解锁其中一人" : "点击解除配对"} disabled={!editable || connectionLocked(row.memberIds)} onClick={() => split(row.memberIds[0])} className="min-h-9 min-w-9 rounded-md font-serif text-lg text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"><span aria-label="已配对">&amp;</span></button>{chip(row.memberIds[1], row.memberIds, row.key)}</div>
            : <div key={row.key} className="rounded-xl border border-dashed bg-muted/25 p-3" data-broken-pair={row.key}><div className="flex flex-wrap items-center gap-2">{chip(row.memberIds[0], row.memberIds, row.key)}<button type="button" aria-label={`恢复 ${name(row.memberIds[0])}与${name(row.memberIds[1])}的配对`} title="点击检查兼容性并恢复配对" disabled={!editable} onClick={() => restoreConnection(row.memberIds, row.key)} className="min-h-9 min-w-9 rounded-md font-serif text-lg text-muted-foreground/50 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"><span aria-label="配对已解除">&amp;</span></button>{chip(row.memberIds[1], row.memberIds, row.key)}</div><p className="mt-2 text-xs text-muted-foreground">已解除 · 点击 & 恢复</p></div>)}
          <div className="flex flex-wrap gap-3">{draft.waitingDuoIds.filter((id) => !brokenIds.has(id) && visible([id])).map((id) => chip(id))}</div>
          {!draft.duos.length && !draft.waitingDuoIds.length && <p className="py-8 text-center text-sm text-muted-foreground">暂无双人配对<br /><span className="text-xs">将姓名拖到这里等待搭档</span></p>}
        </>)}
      <section aria-label="多人本池子" data-board-drop-pool="multi" className={cn("min-w-0 overflow-hidden rounded-2xl border bg-card shadow-xs", over === "multi" && "border-primary ring-2 ring-primary/20")}>
        <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-4">
          <div><h2 className="flex items-center gap-2 text-base font-semibold"><Users className="size-4 text-sky-700" />多人本池子</h2><p className="mt-1 text-xs text-muted-foreground">{draft.multi?.memberIds.length ?? 0} 人{grouped ? "待分组" : "在池中"} · {draft.multiGroups?.length ?? 0} 个已确认小组</p></div>
          {mutable && desktop && draft.multi?.resultId && <Button size="sm" variant="ghost" disabled={reloadNeeded || busy || dirty || pendingOperation} onClick={() => setResultLock(draft.multi!.resultId!, multiLocked, "多人池")}>{multiLocked ? "解除锁定" : "锁定"}</Button>}
        </div>
        <div className="space-y-3 p-4" data-board-multi-waiting>
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{grouped ? "待分组人员" : "多人候选池"}</h3><span className="hidden text-xs text-muted-foreground lg:inline">长按姓名拖动</span></div>
          {draft.multi && <div className="space-y-2 text-xs leading-relaxed text-muted-foreground"><p>{grouped ? "入池共同时间" : "当前安排"}：{formatSlot(draft.multi.bestSlot)}{multiLocked && " · 已锁定"}</p>
            {canViewRawSubmissions && (multiTimes.complete ? <><div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-label="全部共同时间段">{multiTimes.orderedSlots.map((option) => <span key={option.slot} className={cn("rounded-md border px-2 py-1", option.current ? "border-primary/25 bg-primary/10 text-primary" : "bg-background")}><span className="mr-1 font-medium">{option.position <= 3 ? `推荐 ${option.position}` : "共同时间"}</span>{formatSlot(option.slot)}{option.current && "（当前）"}</span>)}</div><p>共 {multiTimes.commonSlots.length} 个全员共同时间。当前安排优先，其余按日期及时段排列；推荐顺序不代表匹配评分。</p>{!multiTimes.currentValid && draft.multi.bestSlot && <p className="text-amber-700">原安排已不在当前全员共同时间中，请核对后调整。</p>}</> : <p>部分成员缺少可用时间，暂不能确认完整共同时间列表。</p>)}
          </div>}
          <div data-board-scroll className="flex max-h-56 min-h-20 flex-wrap content-start gap-2 overflow-y-auto">{draft.multi?.memberIds.filter((id) => visible([id])).map((id) => chip(id))}{!draft.multi && <p className="py-4 text-sm text-muted-foreground">暂无待分组人员，可从其他池子移入。</p>}</div>
          {!grouped && draft.multi && <details className="rounded-lg border bg-muted/10"><summary className="cursor-pointer px-3 py-2 text-xs">多人池评分{multiScore ? ` · ${multiScore.total_score.toFixed(1)}` : " · 保存时重新核验"}</summary><div className="border-t p-3">{multiScore ? <><p className="mb-2 text-sm">整池两两平均：{multiScore.total_score.toFixed(1)}</p>{canViewRawSubmissions && multiScore.score_breakdown != null && <ScoreBreakdownChart breakdown={multiScore.score_breakdown} />}</> : <p className="text-xs text-muted-foreground">保存时重新核验并计算。</p>}</div></details>}
        </div>
        <MatchingBoardSmallGroups groups={(draft.multiGroups ?? []).filter((group) => group.groupKind === "small")} recommendations={smallSuggestions} prefs={currentPrefs}
          canViewTimes={canViewRawSubmissions} canRecommend={canRecommend} editable={editable} poolLocked={multiLocked} loading={small.loading} loaded={small.loaded}
          recommendationError={small.error} waitingCount={draft.multi?.memberIds.length ?? 0} over={over} visible={visible} name={name}
          chip={(id, instance, candidate) => chip(id, undefined, undefined, instance, candidate)} onRefresh={() => { if (editable && !multiLocked && !small.loading) void small.refresh() }}
          onConfirm={confirmSmallGroup} onRemoveMember={removeSmallCandidate} locked={(group) => !!group.resultId && snapshot.lockedResultIds.includes(group.resultId)}
          lockDisabled={!editable || dirty} onLock={(group, isLocked) => { if (group.resultId) setResultLock(group.resultId, isLocked, "多人小组") }}
          isGroupSaved={(group) => !!snapshot.draft.multiGroups?.some((savedGroup) => savedGroup.resultId === group.resultId && !!group.resultId && savedGroup.groupKind === "small" && savedGroup.bestSlot === group.bestSlot && savedGroup.memberIds.length === group.memberIds.length && savedGroup.memberIds.every((id) => group.memberIds.includes(id)))} />
        <MatchingBoardGroups groups={(draft.multiGroups ?? []).filter((group) => group.groupKind !== "small")} candidates={groupTimes} canViewTimes={canViewRawSubmissions} editable={editable} poolLocked={multiLocked} over={over} excluded={excludedCandidates} visible={visible} name={name}
          chip={(id, instance, candidate) => chip(id, undefined, undefined, instance, candidate)} onToggle={toggleCandidate} onConfirm={createGroup}
          locked={(group) => !!group.resultId && snapshot.lockedResultIds.includes(group.resultId)} lockDisabled={!editable || dirty}
          onLock={(group, isLocked) => { if (group.resultId) setResultLock(group.resultId, isLocked, "多人小组") }} />
      </section>
      {pool("unmatched", "未匹配池子", `${draft.unmatchedIds.length} 人`, <UserRound className="size-4 text-amber-700" />, "重新匹配只处理本池人员，保留已有配对和多人池时间。",
        <><div className="flex flex-wrap gap-3">{draft.unmatchedIds.filter((id) => visible([id])).map((id) => chip(id))}</div>{!draft.unmatchedIds.length && <p className="py-8 text-center text-sm text-muted-foreground">当前无人等待重新匹配</p>}</>,
        mutable ? <Button className="hidden lg:inline-flex" variant="outline" size="sm" disabled={!editable || !draft.unmatchedIds.length} onClick={rerun}><RefreshCw className={cn("size-3.5", busy && "animate-spin")} />重新匹配</Button> : null)}
    </div>
    <div className="space-y-3">
      {canViewRawSubmissions && candidates.length > 0 && <details className="rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">时间热力图与资料来源</summary><div className="space-y-3 border-t p-4"><p className="text-xs text-muted-foreground">热力图和原批资料沿用本次运行的输入快照；新调整在保存时重新核验当前资料。</p><TimeSlotHeatmap candidates={candidates} /></div></details>}
      {diagnostics.length > 0 && <details className="rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">已保存的未匹配诊断</summary><div className="border-t p-4"><p className="mb-3 text-xs text-muted-foreground">这里是上次保存的诊断；上方三个池子显示当前编辑。</p><UnmatchedDiagnostics diagnostics={diagnostics} submissionPrefs={submissionPrefs} canViewRawSubmissions={canViewRawSubmissions} /></div></details>}
      {session.round_id && <details className="rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">方案调整记录</summary><div className="space-y-4 border-t p-4">{snapshot.memberLockOperations?.length ? <div className="space-y-2">{snapshot.memberLockOperations.map((operation) => <div key={operation.id} className="rounded-lg border bg-muted/20 p-3 text-xs"><p>个人{operation.locked ? "锁定" : "解锁"} · {new Date(operation.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}（日本时间）</p><p className="mt-1 break-all text-muted-foreground">操作编号：{operation.id}</p></div>)}</div> : null}{snapshot.operations?.length ? <div className="space-y-2">{snapshot.operations.map((operation) => <div key={operation.id} className="rounded-lg border bg-muted/20 p-3 text-xs"><p className="font-medium">三池子统一保存 · {new Date(operation.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}（日本时间）</p><p className="mt-1 text-muted-foreground">{operation.member_count} 人 · {operation.result_count} 组有效结果</p><p className="mt-1 break-all text-muted-foreground">操作编号：{operation.id}</p></div>)}</div> : null}<MatchingAdjustmentRecords records={initialAdjustments} unavailable={adjustmentsUnavailable} loading={busy} readOnly={grouped || !mutable || !desktop || reloadNeeded || dirty || pendingOperation} auditReason={reason} onRefresh={() => { if (!dirty || window.confirm("刷新将丢弃当前未保存调整，确定？")) { resetDraft(); router.refresh() } }} onRecover={(record) => directAction(() => recoverMatchingAdjustment(session.id, record.id, reason))} onNewOperation={(record) => { if (releaseFailedMatchingAdjustmentRequest(session.id, record, adjustmentRequestStorage())) router.refresh() }} /></div></details>}
    </div>
    <Dialog open={!!pairPreview} onOpenChange={(open) => { if (!open) setPairPreview(null) }}>
      <DialogContent><DialogTitle>确认新的双人配对</DialogTitle><DialogDescription>先加入编辑草稿，点击「保存调整」后生效。</DialogDescription><p className="text-base font-medium">{pairPreview?.ids.map(name).join(" & ")}</p><p className="text-sm">共同时间：{formatSlot(previewRow?.best_slot ?? null)}</p>{previewRow && <p className="text-sm">匹配评分：{previewRow.total_score.toFixed(1)}</p>}<DialogFooter><Button variant="outline" onClick={() => setPairPreview(null)}>取消</Button><Button onClick={() => { if (pairPreview?.response.draft) apply(pairPreview.response.draft, pairPreview.response.rows ?? version.rows); setPairPreview(null); setNotice("新配对已加入草稿，等待保存。") }}>确认配对</Button></DialogFooter></DialogContent>
    </Dialog>
    {drag && <div className="pointer-events-none fixed z-[100] rounded-lg border border-primary bg-background px-4 py-2 text-sm font-medium shadow-xl" style={{ left: drag.x + 12, top: drag.y + 12 }}>{name(drag.id)}</div>}
  </div>
}
