import Link from "next/link"
import { ArrowRight, Sprout } from "lucide-react"
import { storyMission } from "@/lib/landing-story"

export function OrganizationStoryCard() {
  return (
    <Link
      href="/organization/story"
      className="group block rounded-[1.6rem] border border-[#e5dfd3] bg-white/92 p-6 shadow-[0_14px_34px_rgba(43,53,35,0.08)] transition hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#edf4e7] text-[#5f8549]">
          <Sprout className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
            社团介绍
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight">
            {storyMission.title}
          </h2>
          <p className="mt-3 text-sm leading-[1.9] text-[#4c5148]">
            {storyMission.body}
          </p>
        </div>
        <ArrowRight className="mt-2 size-5 text-[#6b8f4e] transition group-hover:translate-x-1" />
      </div>
    </Link>
  )
}
