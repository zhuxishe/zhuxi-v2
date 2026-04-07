"use client"

import { useState, useTransition } from "react"
import { generateTestData } from "./actions"

export function SeedForm() {
  const [count, setCount] = useState(20)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    success?: boolean
    error?: string
    membersCreated?: number
    roundId?: string
  } | null>(null)

  function handleSubmit() {
    setResult(null)
    startTransition(async () => {
      const res = await generateTestData(count)
      setResult(res)
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          生成成员数量
        </label>
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "生成中..." : "生成测试数据"}
      </button>

      {result?.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result?.success && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          <p>成功生成 {result.membersCreated} 名测试成员</p>
          <p className="mt-1 text-xs text-muted-foreground">
            轮次 ID: {result.roundId}
          </p>
        </div>
      )}
    </div>
  )
}
