import Link from "next/link"
import { ArrowLeft, Sprout } from "lucide-react"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { storyMission, storySections } from "@/lib/landing-story"

export default function OrganizationStoryPage() {
  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main className="min-h-screen bg-[#fffdf7] px-5 pb-16 pt-28 text-[#171717] grain-overlay">
        <section className="mx-auto max-w-5xl">
          <Link href="/organization" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5f8549]">
            <ArrowLeft className="size-4" />
            返回关于我们
          </Link>
          <div className="mt-6 rounded-[2rem] border border-[#e5dfd3] bg-white/92 p-7 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-10">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
              <Sprout className="size-4" />
              社团介绍
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-tight md:text-6xl">
              {storyMission.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-[1.9] text-[#4c5148]">
              {storyMission.body}
            </p>
            <p className="mt-7 rounded-2xl bg-[#edf4e7] p-5 font-display text-2xl text-[#5f8549]">
              {storyMission.mission}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {storySections.map((section, index) => (
              <article key={section.title} className="rounded-[1.6rem] border border-[#e5dfd3] bg-white/92 p-6 shadow-[0_14px_34px_rgba(43,53,35,0.08)]">
                <p className="font-display text-3xl font-bold text-[#6b8f4e]">0{index + 1}</p>
                <h2 className="mt-4 font-display text-2xl font-bold">{section.title}</h2>
                <p className="mt-4 text-sm leading-[1.95] text-[#4c5148]">{section.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
