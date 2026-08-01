import Image from "next/image"
import { getTranslations } from "next-intl/server"

const moments = [
  { key: "timeline1", image: "/images/landing/activity-wall-20260520/boardgame-06.webp" },
  { key: "timeline2", image: "/images/landing/activity-wall-20260520/shibuya-party-06.webp" },
  { key: "timeline3", image: "/images/landing/activity-wall-20260520/daiba-01.webp" },
  { key: "timeline4", image: "/images/landing/activity-wall-20260520/boardgame-04.webp" },
  { key: "timeline5", image: "/images/landing/activity-wall-20260520/shibuya-party-09.webp" },
] as const

export async function CollectiveSocialTimeline() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="border-t border-[#e3ddcf] bg-[#f4f1e7] px-5 py-20 sm:px-8 md:py-28" aria-labelledby="semester-story-title">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("timelineEyebrow")}</p>
          <h2 id="semester-story-title" className="mt-4 font-display text-3xl font-bold tracking-[0.05em] text-[#1d291b] sm:text-4xl">{t("timelineTitle")}</h2>
          <p className="mt-4 text-sm leading-[1.85] text-[#62685d] sm:text-base">{t("timelineBody")}</p>
        </div>

        <ol className="relative mt-12 space-y-7 before:absolute before:bottom-10 before:left-[2.45rem] before:top-10 before:w-px before:bg-[#bdcbb3] md:before:left-1/2">
          {moments.map(({ key, image }, index) => (
            <li key={key} className="relative grid gap-5 pl-16 sm:pl-20 md:grid-cols-2 md:gap-16 md:pl-0">
              <span className="absolute left-4 top-8 z-10 grid size-11 place-items-center rounded-full border border-[#94aa86] bg-[#fffdf7] font-display text-xs font-bold text-[#4f6843] sm:left-5 md:left-1/2 md:-translate-x-1/2">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className={`relative aspect-[3/2] overflow-hidden rounded-[1.5rem] ${index % 2 ? "md:col-start-2" : "md:col-start-1"}`}>
                <Image src={image} alt="" fill sizes="(min-width: 768px) 34rem, 80vw" className="object-cover" />
              </div>
              <div className={`self-center py-4 ${index % 2 ? "md:col-start-1 md:row-start-1 md:text-right" : "md:col-start-2"}`}>
                <p className="text-xs font-bold tracking-[0.22em] text-[#4f6843]">SEMESTER {String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 font-display text-2xl font-bold text-[#21301f] sm:text-3xl">{t(`${key}Title`)}</h3>
                <p className={`mt-3 max-w-md text-sm leading-[1.9] text-[#596052] ${index % 2 ? "md:ml-auto" : ""}`}>{t(`${key}Body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
