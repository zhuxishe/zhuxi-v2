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
            返回
          </Link>
        </div>
        <section className="mx-auto mb-5 max-w-5xl rounded-[1.5rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_12px_30px_rgba(44,55,35,0.08)] md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">活动介绍</p>
          <div className="mt-3 space-y-2 text-sm leading-[1.9] text-[#4c5148] md:text-base">
            <p>
              社交剧本类活动是竹溪社更具特色的小规模社交形式。区别于传统意义上的剧本杀，我们进行了大量的原创制作，并融入了各类双人/多人剧本、城市探索、手作体验、主题任务、桌游推理、沉浸式互动和轻博弈玩法。我们会提前把“去哪儿、做什么、聊什么、如何推进关系”放进活动结构里，让陌生的你我也不必硬找话题，在过程中自然的熟悉彼此。
            </p>
            <p>
              “社交剧本类”活动尤其适合慢热、想找同好、喜欢明确主题或希望进行更深入交流的成员。工作人员会结合性格算法、兴趣标签、社交风格和边界需求进行安排，力求让双方都有舒服的互动节奏。期待大家可以从一场双人本、一次城市散步、一个手作任务或一局推理游戏开始，慢慢找到真正聊得来、玩得来的伙伴。
            </p>
            <p>
              竹溪社将定期（每月2次）为玩家提供丰富的双人/多人活动以及安心的社交方案，并保驾护航～ 此外竹溪社通过自研算法，结合玩家性格测试、合拍分数等数据优化匹配模型，力求帮你找到最适合的TA！
            </p>
          </div>
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
