"use client"

import Link from "next/link"
import { CheckCircle, MessageSquare } from "lucide-react"
import type { RegistrationReturnContext } from "@/lib/registration-review-gate/navigation"

interface Props {
  matchResultId: string
  members: { id: string; name: string }[]
  reviewedIds: string[]
  registrationReturn?: RegistrationReturnContext | null
}

export function GroupReviewSelector({ matchResultId, members, reviewedIds, registrationReturn }: Props) {
  return (
    <div className="space-y-2 max-w-md">
      {members.map((m) => {
        const done = reviewedIds.includes(m.id)
        const query = new URLSearchParams({ reviewee: m.id })
        if (registrationReturn) {
          query.set("returnRound", registrationReturn.roundId)
          if (registrationReturn.fromParticipation) query.set("from", "participation")
        }
        return (
          <Link
            key={m.id}
            href={done ? "#" : `/app/reviews/new/${matchResultId}?${query}`}
            className={`flex items-center justify-between rounded-xl p-4 ring-1 transition-colors ${
              done
                ? "ring-green-200 bg-green-50/50 cursor-default"
                : "ring-foreground/10 bg-card hover:bg-muted/50"
            }`}
            onClick={done ? (e) => e.preventDefault() : undefined}
          >
            <span className="text-sm font-medium">{m.name}</span>
            {done ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="size-3.5" /> 已评价
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-sakura">
                <MessageSquare className="size-3.5" /> 去评价
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
