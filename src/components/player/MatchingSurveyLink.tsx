"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, type ComponentProps, type MouseEvent } from "react"
import { checkMatchingEntry, type MatchingEntryCheck } from "@/app/app/matching/survey/profile-actions"
import { buildMatchingCompletionHref } from "@/lib/matching/completion-flow"
import { MatchingProfileDialog } from "./MatchingProfileDialog"

type Props = ComponentProps<typeof Link>

export function MatchingSurveyLink({ href, onClick, children, ...props }: Props) {
  const router = useRouter()
  const [check, setCheck] = useState<MatchingEntryCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const target = typeof href === "string" ? href : null
  const isSurvey = target?.split(/[?#]/, 1)[0] === "/app/matching/survey"
  const params = new URLSearchParams(target?.split("?", 2)[1]?.split("#", 1)[0])

  async function inspect() {
    if (inFlight.current || !target) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await checkMatchingEntry(params.get("round") ?? undefined)
      if (result.state === "continue") { setCheck(null); router.push(target) }
      else setCheck(result)
    } catch { setCheck({ state: "failed" }) }
    finally { inFlight.current = false; setBusy(false) }
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || !isSurvey || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return
    event.preventDefault()
    void inspect()
  }

  return <>
    <Link {...props} href={href} onClick={handleClick} aria-busy={busy || undefined} prefetch={isSurvey ? false : props.prefetch}>{children}</Link>
    <MatchingProfileDialog open={check?.state === "incomplete" || check?.state === "failed"}
      missing={check?.state === "incomplete" ? check.missing : []} failed={check?.state === "failed"} busy={busy}
      onCancel={() => setCheck(null)} onRetry={() => { void inspect() }}
      onComplete={() => {
        if (check?.state !== "incomplete") return
        router.push(buildMatchingCompletionHref({ roundId: check.roundId, fromParticipation: params.get("from") === "participation" }))
      }} />
  </>
}
