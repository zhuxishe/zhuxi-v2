"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { recommendBoardSmallGroups } from "@/app/admin/matching/[id]/board-actions"
import type { BoardRequest, BoardSmallGroupRecommendation } from "@/lib/matching/board-types"

/** Suggestions are separate from assignments. Editing the board never silently regenerates them. */
export function useSmallGroupRecommendations(input: BoardRequest, canRecommend: boolean, blocked: boolean) {
  const [recommendations, setRecommendations] = useState<BoardSmallGroupRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const current = useRef(input)
  current.current = input
  const generation = useRef(0)
  const started = useRef(false)

  const refresh = useCallback(async () => {
    const request = current.current
    const signature = JSON.stringify(request)
    const attempt = ++generation.current
    setLoading(true); setError("")
    try {
      const response = await recommendBoardSmallGroups(request)
      if (generation.current !== attempt) return
      if (signature !== JSON.stringify(current.current)) {
        setError("人员或方案已调整，请点击「重新推荐」按当前人员重新生成。")
        return
      }
      if (response.error || !response.recommendations) {
        setError(response.error || "暂时无法生成推荐，请稍后重试。")
        return
      }
      setRecommendations(response.recommendations); setLoaded(true)
    } catch {
      if (generation.current === attempt) setError("暂时无法生成推荐，请点击「重新推荐」重试。")
    } finally {
      if (generation.current === attempt) setLoading(false)
    }
  }, [])

  useEffect(() => () => { generation.current++; started.current = false }, [])
  useEffect(() => {
    if (!canRecommend || blocked || started.current) return
    started.current = true
    void refresh()
  }, [canRecommend, blocked, refresh])

  return { recommendations, setRecommendations, loading, loaded, error, refresh }
}
