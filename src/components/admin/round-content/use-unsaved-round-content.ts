"use client"

import { useEffect } from "react"

export function useUnsavedRoundContent(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const guardUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return
      if (window.confirm("有未保存的内容修改，确定离开并放弃这些修改吗？")) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener("beforeunload", guardUnload)
    document.addEventListener("click", guardLink, true)
    return () => {
      window.removeEventListener("beforeunload", guardUnload)
      document.removeEventListener("click", guardLink, true)
    }
  }, [dirty])
}
