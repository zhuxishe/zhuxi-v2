import Image from "next/image"
import { getTranslations } from "next-intl/server"

const moments = [
  { key: "timeline1", image: "/images/landing/activity-wall-20260520/boardgame-06.webp" },
  { key: "timeline2", image: "/images/landing/activity-wall-20260520/shibuya-party-06.webp" },
  { key: "timeline3", image: "/images/landing/activity-wall-20260520/daiba-05.webp" },
  { key: "timeline4", image: "/images/landing/activity-wall-20260520/boardgame-04.webp" },
  { key: "timeline5", image: "/images/landing/activity-wall-20260520/shibuya-party-01.webp" },
] as const

export async function CollectiveSocialTimeline() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="border-t border-[#e3ddcf] bg-[#f4f1e7] px-5 py-14 sm:px-8 sm:py-20 md:py-28" aria-labelledby="semester-story-title">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("timelineEyebrow")}</p>
          <h2 id="semester-story-title" className="mt-3 font-display text-[1.75rem] font-bold leading-tight tracking-[0.05em] text-[#1d291b] sm:mt-4 sm:text-4xl">{t("timelineTitle")}</h2>
        </div>

        <ol className="relative mt-8 space-y-10 md:mt-12 md:space-y-7 md:before:absolute md:before:bottom-10 md:before:left-1/2 md:before:top-10 md:before:w-px md:before:bg-[#bdcbb3]">
          {moments.map(({ key, image }, index) => (
            <li key={key} className="relative grid gap-3 md:grid-cols-2 md:gap-16">
              <span className="absolute left-3 top-3 z-10 grid size-10 place-items-center rounded-full border border-[#94aa86] bg-[#fffdf7]/92 font-display text-xs font-bold text-[#4f6843] backdrop-blur-sm md:left-1/2 md:top-8 md:size-11 md:-translate-x-1/2">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className={`relative aspect-[4/3] overflow-hidden rounded-[1.25rem] md:aspect-[3/2] md:rounded-[1.5rem] ${index % 2 ? "md:col-start-2" : "md:col-start-1"}`}>
                <Image src={image} alt="" fill sizes="(min-width: 768px) 34rem, 80vw" className="object-cover" />
              </div>
              <div className={`self-center md:py-4 ${index % 2 ? "md:col-start-1 md:row-start-1 md:text-right" : "md:col-start-2"}`}>
                <p className="text-[11px] font-bold tracking-[0.2em] text-[#4f6843] sm:text-xs sm:tracking-[0.22em]">SEMESTER {String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 font-display text-2xl font-bold text-[#21301f] sm:mt-3 sm:text-3xl">{t(`${key}Title`)}</h3>
                <p className={`mt-2 max-w-md text-sm leading-[1.75] text-[#596052] sm:mt-3 sm:leading-[1.9] ${index % 2 ? "md:ml-auto" : ""}`}>{t(`${key}Body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
