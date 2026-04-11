"use client"

import Link from "next/link"
import { CheckCircle, MessageSquare } from "lucide-react"

interface Props {
  matchResultId: string
  members: { id: string; name: string }[]
  reviewedIds: string[]
}

export function GroupReviewSelector({ matchResultId, members, reviewedIds }: Props) {
  return (
    <div className="space-y-2 max-w-md">
      {members.map((m) => {
        const done = reviewedIds.includes(m.id)
        return (
          <Link
            key={m.id}
            href={done ? "#" : `/app/reviews/new/${matchResultId}?reviewee=${m.id}`}
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
