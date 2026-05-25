import { getLocale } from "next-intl/server"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { PublicScriptLibrary } from "@/components/landing/PublicScriptLibrary"
import { ScriptEventReviewsSection } from "@/components/landing/ScriptEventReviewsSection"
import { landingCopy } from "@/lib/landing-copy"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function ScriptLibraryPage() {
  const copy = landingCopy(await getLocale()).activities

  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main className="min-h-screen bg-[#fffdf7] px-5 pb-16 pt-28 text-[#171717] grain-overlay">
        <div className="mx-auto max-w-5xl">
          <Link href="/scripts" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#5f8549]">
            <ArrowLeft className="size-4" />
            返回活动介绍
          </Link>
        </div>
        <section className="mx-auto mb-5 max-w-5xl rounded-[1.5rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_12px_30px_rgba(44,55,35,0.08)] md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">活动介绍</p>
          <p className="mt-3 text-sm leading-[1.9] text-[#4c5148] md:text-base">
            竹溪社将定期（每月2次）为玩家提供丰富的双人/多人社交平台、原创社交剧本等内容向大家提供安心的社交方案，并保驾护航～即使是第一次见面也无需担心尴尬！
            此外竹溪社通过自研算法，结合玩家性格测试、合拍分数等数据优化匹配模型，力求帮你找到最适合的TA！
          </p>
        </section>
        <section className="mx-auto mb-8 max-w-5xl rounded-[1.5rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
            {copy.scriptTeaserTitle}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight md:text-6xl">{copy.libraryTitle}</h1>
          <div className="mt-3 h-2 w-40 rounded-[50%] border-b-[6px] border-[#f3cf55]" />
          {copy.librarySubtitle && (
            <p className="mt-5 max-w-xl text-sm leading-[1.9] text-[#4c5148] md:text-base">
              {copy.librarySubtitle}
            </p>
          )}
        </section>
        <div className="mx-auto max-w-5xl">
          <ScriptEventReviewsSection />
          <PublicScriptLibrary showHeader={false} />
        </div>
      </main>
      <LandingFooter />
    </>
  )
}
