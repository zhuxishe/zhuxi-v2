import Link from "next/link"
import type { CommunityTab } from "@/lib/community/types"
import { COMMUNITY_TABS } from "@/lib/community/constants"
import { cn } from "@/lib/utils"

interface CommunityTabsProps {
  currentTab: CommunityTab
  labels: Record<CommunityTab, string>
  ariaLabel: string
  baseHref?: string
  className?: string
}

export function CommunityTabs({
  currentTab,
  labels,
  ariaLabel,
  baseHref = "/app/community",
  className,
}: CommunityTabsProps) {
  return (
    <nav aria-label={ariaLabel} className={cn("overflow-x-auto scrollbar-none", className)}>
      <div className="flex min-w-max items-center gap-2">
        {COMMUNITY_TABS.map((tab) => {
          const active = currentTab === tab
          const label = labels[tab]
          const compactLabel = [...label].length >= 4
          return (
            <Link
              key={tab}
              href={`${baseHref}?tab=${tab}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "grid size-[58px] shrink-0 place-items-center rounded-full text-center text-[13px] font-medium leading-none whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "motion-reduce:transition-none",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              <span className={compactLabel ? "text-[11px]" : "text-[13px]"}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
