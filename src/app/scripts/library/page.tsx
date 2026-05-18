import { getLocale } from "next-intl/server"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { PublicScriptLibrary } from "@/components/landing/PublicScriptLibrary"
import { landingCopy } from "@/lib/landing-copy"

export default async function ScriptLibraryPage() {
  const copy = landingCopy(await getLocale()).activities

  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main className="min-h-screen bg-[#fffdf7] px-5 pb-16 pt-28 text-[#171717] grain-overlay">
        <section className="mx-auto mb-8 max-w-5xl rounded-[2rem] border border-[#e5dfd3] bg-white/88 p-7 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
            {copy.scriptTeaserTitle}
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-tight md:text-6xl">{copy.libraryTitle}</h1>
          <div className="mt-3 h-2 w-40 rounded-[50%] border-b-[6px] border-[#f3cf55]" />
          <p className="mt-5 max-w-xl text-sm leading-[1.9] text-[#4c5148] md:text-base">
            {copy.librarySubtitle}
          </p>
        </section>
        <div className="mx-auto max-w-5xl">
          <PublicScriptLibrary showHeader={false} />
        </div>
      </main>
      <LandingFooter />
    </>
  )
}
