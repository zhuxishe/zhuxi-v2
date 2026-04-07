"use client"

import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <p className="text-4xl">😥</p>
      <p className="text-sm text-muted-foreground">出了点问题，请重试</p>
      <Button variant="outline" onClick={reset}>重试</Button>
    </div>
  )
}
