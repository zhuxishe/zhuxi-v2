"use client"

import { type ReactNode, useEffect, useRef } from "react"
import { useState } from "react"
import { initHomeTearEasterEgg } from "./HomeTearEasterEgg.logic"
import { HomeTearIntroStage } from "./HomeTearIntroStage"
import styles from "./HomeTearEasterEgg.module.css"

export function HomeTearEasterEgg({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const tearRef = useRef<HTMLButtonElement>(null)
  const returnRef = useRef<HTMLButtonElement>(null)
  const [playToken, setPlayToken] = useState(0)

  useEffect(() => {
    const root = rootRef.current
    const paper = paperRef.current
    const tear = tearRef.current
    const posterReturn = returnRef.current
    if (!root || !paper || !tear || !posterReturn) return
    return initHomeTearEasterEgg({
      root,
      paper,
      tear,
      posterReturn,
      styles,
      onOpen: () => setPlayToken((value) => value + 1),
    })
  }, [])

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.poster} data-no-tear>
        <HomeTearIntroStage playToken={playToken} />
      </div>
      <div ref={paperRef} className={styles.paper} data-page-paper>{children}</div>
      <button ref={tearRef} className={styles.tear} type="button" aria-label="从左下角撕开页面" data-no-tear>
        <svg viewBox="0 0 82 62" aria-hidden="true"><path d="M5 58 C 18 38, 33 51, 45 32 S 68 14, 78 5" /></svg>
      </button>
      <button ref={returnRef} className={styles.posterReturn} type="button" data-no-tear>返回主页</button>
    </div>
  )
}
