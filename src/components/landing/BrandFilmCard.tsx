"use client"

import { useCallback, useState } from "react"
import { Play, RotateCcw } from "lucide-react"
import { EmbeddedIntroFilm } from "./EmbeddedIntroFilm"

export function BrandFilmCard({ playLabel, replayLabel, posterTitle, posterSubtitle }: {
  playLabel: string
  replayLabel: string
  posterTitle: string
  posterSubtitle: string
}) {
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)
  const [playToken, setPlayToken] = useState(0)

  const play = () => {
    setFinished(false)
    setPlaying(true)
    setPlayToken((value) => value + 1)
  }

  const finish = useCallback(() => {
    setPlaying(false)
    setFinished(true)
  }, [])

  return (
    <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-[#dcd3c4] bg-[#f7f3eb] shadow-[0_18px_54px_rgba(35,27,16,0.12)]">
      {playing ? (
        <EmbeddedIntroFilm playToken={playToken} onFinish={finish} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(198,216,165,0.45),transparent_34%),linear-gradient(135deg,#f7f3eb,#eee5d6)]">
          <div className="absolute inset-8 rounded-[1.5rem] border border-[#1E3932]/10" />
          <div className="absolute left-1/2 top-[42%] grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#1E3932] font-display text-3xl font-bold text-white shadow-[0_18px_42px_rgba(30,57,50,0.24)]">
            竹
          </div>
          <div className="absolute left-10 right-10 top-[42%] h-px bg-gradient-to-r from-transparent via-[#1E3932]/25 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 text-center">
            <p className="font-display text-xl font-semibold text-[#1E3932] md:text-2xl">
              {posterTitle}
            </p>
            <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground md:text-sm">
              {posterSubtitle}
            </p>
          </div>
        </div>
      )}

      {!playing && (
        <button
          type="button"
          onClick={play}
          className="absolute left-1/2 top-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-[#1E3932] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(30,57,50,0.22)] transition hover:bg-[#006241] active:scale-95"
        >
          {finished ? <RotateCcw className="size-4" /> : <Play className="size-4 fill-current" />}
          {finished ? replayLabel : playLabel}
        </button>
      )}
    </div>
  )
}
