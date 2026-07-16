"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowDown, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadMoreLinkProps {
  href: string
  label: string
  className?: string
}

export function LoadMoreLink({ href, label, className }: LoadMoreLinkProps) {
  const [loading, setLoading] = useState(false)
  return (
    <Link
      href={href}
      scroll={false}
      aria-busy={loading}
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setLoading(true)
      }}
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-primary shadow-soft transition-colors",
        "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-reduce:transition-none",
        className,
      )}
    >
      {loading ? `${label}…` : label}
      {loading ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowDown className="size-4" aria-hidden="true" />}
    </Link>
  )
}
