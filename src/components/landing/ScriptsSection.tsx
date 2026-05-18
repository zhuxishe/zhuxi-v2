import Image from "next/image"
import { getLocale } from "next-intl/server"
import { ActivityPhotoGrid } from "@/components/landing/ActivityPhotoGrid"
import { ScriptLibraryTeaser } from "@/components/landing/ScriptLibraryTeaser"
import { landingCopy } from "@/lib/landing-copy"

export async function ScriptsSection() {
  const copy = landingCopy(await getLocale()).activities

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] pb-14 pt-28 text-[#171717] grain-overlay">
      <Image src="/images/landing/mobile-redesign/activities-hero.webp" alt="" width={1400} height={700} priority className="absolute right-0 top-0 h-[520px] w-[68%] object-cover opacity-80" />
      <div className="absolute inset-x-0 top-0 h-[580px] bg-gradient-to-r from-[#fffdf7] via-[#fffdf7]/82 to-transparent" />
      <div className="relative mx-auto max-w-5xl px-7 pt-40">
        <h1 className="font-display text-6xl font-bold tracking-[0.18em] md:text-7xl">{copy.title}</h1>
        <div className="mt-8 flex items-center gap-5 text-[#7fa063]">
          <span className="h-px w-28 bg-[#9eb886]" />
          <span className="text-2xl">✿</span>
          <span className="h-px w-28 bg-[#9eb886]" />
        </div>
        <p className="mt-10 whitespace-pre-line text-2xl leading-relaxed">{copy.subtitle}</p>
      </div>

      <div className="relative mx-auto mt-14 max-w-5xl space-y-8 px-5">
        <ActivityPhotoGrid title={copy.photoTitle} subtitle={copy.photoSubtitle} tags={copy.photoTags} />
        <ScriptLibraryTeaser title={copy.scriptTeaserTitle} body={copy.scriptTeaserBody} cta={copy.scriptTeaserCta} />

        <div className="rounded-[1.2rem] border border-[#e3dfd2] bg-white/82 px-7 py-10 text-center shadow-[0_14px_34px_rgba(43,53,35,0.08)]">
          <p className="whitespace-pre-line font-display text-2xl leading-relaxed">
            {copy.note}
          </p>
        </div>
      </div>
    </section>
  )
}
