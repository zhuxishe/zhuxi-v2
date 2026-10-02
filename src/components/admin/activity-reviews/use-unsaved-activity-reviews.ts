"use client"

import { useEffect, useId } from "react"

const dirtyForms = new Set<string>()
let listening = false

export function confirmActivityReviewNavigation() {
  return dirtyForms.size === 0 || window.confirm("有未保存的互评管理修改，确定离开并放弃这些修改吗？")
}

function guardUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = "" }
function guardLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return
  const anchor = event.target.closest<HTMLAnchorElement>("a[href]")
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
  const destination = new URL(anchor.href, window.location.href)
  if (destination.pathname === window.location.pathname && destination.search === window.location.search) return
  if (confirmActivityReviewNavigation()) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

function syncListeners() {
  if (dirtyForms.size > 0 && !listening) {
    window.addEventListener("beforeunload", guardUnload)
    document.addEventListener("click", guardLink, true)
    listening = true
  } else if (dirtyForms.size === 0 && listening) {
    window.removeEventListener("beforeunload", guardUnload)
    document.removeEventListener("click", guardLink, true)
    listening = false
  }
}

export function useUnsavedActivityReviews(dirty: boolean) {
  const id = useId()
  useEffect(() => {
    if (dirty) dirtyForms.add(id)
    else dirtyForms.delete(id)
    syncListeners()
    return () => { dirtyForms.delete(id); syncListeners() }
  }, [dirty, id])
  return () => {
    const otherDirty = [...dirtyForms].some((formId) => formId !== id)
    return !otherDirty || window.confirm("其他表单有未保存的修改。保存后会刷新当前活动资料，请先保存其他修改，或确认放弃后继续。")
  }
}
