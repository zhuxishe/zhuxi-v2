"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ArrowRight, Play, RotateCcw, X } from "lucide-react"
import { EmbeddedIntroFilm } from "./EmbeddedIntroFilm"
import { OrigamiCraneIcon } from "./OrigamiCraneIcon"

type OrigamiCraneLauncherProps = {
  ariaLabel: string
  bubbleLabel: string
  title: string
  subtitle: string
  replayLabel: string
  closeLabel: string
  activitiesLabel: string
}

export function OrigamiCraneLauncher({
  ariaLabel,
  bubbleLabel,
  title,
  subtitle,
  replayLabel,
  closeLabel,
  activitiesLabel,
}: OrigamiCraneLauncherProps) {
  const [open, setOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const [playToken, setPlayToken] = useState(0)

  const openFilm = () => {
    setFinished(false)
    setOpen(true)
    setPlayToken((value) => value + 1)
  }

  const closeFilm = useCallback(() => {
    setOpen(false)
    setFinished(false)
  }, [])

  const replay = () => {
    setFinished(false)
    setPlayToken((value) => value + 1)
  }

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFilm()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [closeFilm, open])

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={openFilm}
        className="group fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-full border border-[#d9d1c1] bg-[#fffaf1]/92 p-2 pr-4 text-sm font-semibold text-[#10251f] shadow-[0_18px_45px_rgba(16,37,31,0.16)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-[#1E3932]/30 hover:bg-white active:scale-95 md:bottom-7 md:right-7"
      >
        <span className="grid size-12 place-items-center rounded-full bg-[#10251f]">
          <OrigamiCraneIcon className="size-11 animate-float" />
        </span>
        <span className="hidden sm:inline">{bubbleLabel}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-[#08130f]/78 px-4 py-6 backdrop-blur-md animate-fade-in md:px-8">
          <div className="mx-auto flex h-full max-w-6xl flex-col justify-center">
            <div className="mb-3 flex items-center justify-between text-white">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-white/50">ZHUXISHE OPENING · 14S</p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight md:text-4xl">{title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/64 md:text-base">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={closeFilm}
                aria-label={closeLabel}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/8 text-white transition hover:bg-white hover:text-[#10251f]"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[#f7f3eb] shadow-[0_28px_90px_rgba(0,0,0,0.36)]">
              <div className="relative aspect-video">
                <EmbeddedIntroFilm playToken={playToken} onFinish={() => setFinished(true)} />
                {finished && (
                  <div className="absolute inset-0 grid place-items-center bg-[#f7f3eb]/88 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="font-display text-2xl font-bold text-[#10251f]">{title}</p>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={replay}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#10251f]/20 px-5 py-3 text-sm font-semibold text-[#10251f] transition hover:bg-[#10251f] hover:text-white"
                        >
                          <RotateCcw className="size-4" />
                          {replayLabel}
                        </button>
                        <Link
                          href="/scripts"
                          onClick={closeFilm}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#00754A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#006241]"
                        >
                          {activitiesLabel}
                          <ArrowRight className="size-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
