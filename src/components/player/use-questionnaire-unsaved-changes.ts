"use client"

import { useCallback, useEffect, useRef } from "react"

/** Warnings do not save drafts. A successful submit clears the guard before navigation. */
export function useQuestionnaireUnsavedChanges(locale: string) {
  const dirty = useRef(false)
  const message = locale === "ja"
    ? "このアンケートには未送信の回答があります。回答を破棄して移動しますか？"
    : "当前问卷有尚未提交的内容，离开后这些内容不会保存。确定离开吗？"
  const markDirty = useCallback(() => { dirty.current = true }, [])
  const markSaved = useCallback(() => { dirty.current = false }, [])
  const confirmLeave = useCallback(() => {
    if (!dirty.current) return true
    if (!window.confirm(message)) return false
    dirty.current = false
    return true
  }, [message])

  useEffect(() => {
    const guardUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    const guardLink = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return
      const destination = new URL(anchor.href, window.location.href)
      const current = window.location
      if (destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) return
      if (confirmLeave()) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    // The Navigation API can also cancel same-document back/forward navigation where supported.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    const guardNavigation = (event: Event) => {
      const navigate = event as Event & {
        canIntercept?: boolean
        hashChange?: boolean
        navigationType?: string
        destination?: { url: string; sameDocument: boolean }
      }
      if (!dirty.current || !event.cancelable || !navigate.canIntercept || navigate.hashChange) return
      // Next's router.refresh() replaces history at the current URL. It keeps
      // the questionnaire mounted, so neither warn nor clear its dirty state.
      // A document reload still needs the unsaved-answer warning.
      if (navigate.destination?.sameDocument && navigate.navigationType !== "reload") {
        try {
          const destination = new URL(navigate.destination.url, window.location.href)
          const current = window.location
          if (destination.origin === current.origin && destination.pathname === current.pathname && destination.search === current.search) return
        } catch { /* An unknown destination must not bypass the leave guard. */ }
      }
      if (confirmLeave()) return
      event.preventDefault()
    }
    window.addEventListener("beforeunload", guardUnload)
    document.addEventListener("click", guardLink, true)
    navigation?.addEventListener("navigate", guardNavigation)
    return () => {
      window.removeEventListener("beforeunload", guardUnload)
      document.removeEventListener("click", guardLink, true)
      navigation?.removeEventListener("navigate", guardNavigation)
    }
  }, [confirmLeave])

  return { markDirty, markSaved, confirmLeave }
}
