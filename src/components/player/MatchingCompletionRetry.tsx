"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function MatchingCompletionRetry({ label }: { label: string }) {
  const router = useRouter()
  return <Button onClick={() => router.refresh()}>{label}</Button>
}
