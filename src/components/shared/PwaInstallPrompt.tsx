"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Download, X } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function PwaInstallPrompt() {
  const pathname = usePathname()
  const t = useTranslations("pwa")
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
      setDismissed(false)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
  }, [])

  if (!promptEvent || dismissed || pathname?.startsWith("/admin")) return null
  const bottomOffset = pathname?.startsWith("/app") ? "bottom-24 md:bottom-7" : "bottom-5 md:bottom-7"

  const install = async () => {
    await promptEvent.prompt()
    await promptEvent.userChoice.catch(() => undefined)
    setPromptEvent(null)
  }

  return (
    <div className={`fixed ${bottomOffset} left-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-[#d9d1c1] bg-[#fffaf1]/96 p-2 pl-4 text-sm font-semibold text-[#10251f] shadow-[0_18px_45px_rgba(16,37,31,0.16)] backdrop-blur-xl md:left-7`}>
      <button type="button" onClick={install} className="inline-flex items-center gap-2 rounded-full bg-[#00754A] px-4 py-2 text-white transition hover:bg-[#006241]">
        <Download className="size-4" />
        {t("install")}
      </button>
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{t("hint")}</span>
      <button type="button" onClick={() => setDismissed(true)} aria-label={t("dismiss")} className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-black/5 hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  )
}
