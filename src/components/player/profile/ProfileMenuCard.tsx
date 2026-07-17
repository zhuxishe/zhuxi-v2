import type { LucideIcon } from "lucide-react"
import { BarChart3, ChevronRight, FileText, ShieldCheck, Smile, UserRound } from "lucide-react"
import Link from "next/link"

export interface ProfileMenuLabels {
  personalProfile: string
  communityManagement: string
  supplementary: string
  personalitySelf: string
  personalityTest: string
}

interface ProfileMenuCardProps {
  labels: ProfileMenuLabels
  statuses: {
    personalProfile: string
    community: string
    supplementary: string
    personality: string
    quiz: string
  }
}

const ITEMS: Array<{
  key: keyof ProfileMenuCardProps["statuses"]
  labelKey: keyof ProfileMenuLabels
  href: string
  icon: LucideIcon
}> = [
  { key: "personalProfile", labelKey: "personalProfile", href: "/app/profile/edit", icon: UserRound },
  { key: "community", labelKey: "communityManagement", href: "/app/profile/community", icon: ShieldCheck },
  { key: "supplementary", labelKey: "supplementary", href: "/app/profile/supplementary", icon: FileText },
  { key: "personality", labelKey: "personalitySelf", href: "/app/profile/personality", icon: Smile },
  { key: "quiz", labelKey: "personalityTest", href: "/app/profile/quiz", icon: BarChart3 },
]

export function ProfileMenuCard({ labels, statuses }: ProfileMenuCardProps) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-border/90 bg-card px-4 shadow-soft">
      {ITEMS.map(({ key, labelKey, href, icon: Icon }, index) => (
        <Link
          key={key}
          href={href}
          className={`group flex min-h-14 items-center gap-3 py-1.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${index > 0 ? "border-t border-border/80" : ""}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <Icon className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-5">{labels[labelKey]}</span>
            <span className="block truncate text-[11px] leading-4 text-muted-foreground">{statuses[key]}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground/80 transition-transform group-hover:translate-x-0.5" strokeWidth={1.7} aria-hidden="true" />
        </Link>
      ))}
    </section>
  )
}
