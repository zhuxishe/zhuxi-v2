import { getTranslations } from "next-intl/server"

const NODES = [
  "left-[18%] top-[24%]",
  "left-[42%] top-[18%]",
  "left-[72%] top-[30%]",
  "left-[28%] top-[66%]",
  "left-[58%] top-[72%]",
] as const

export async function BrandMotionSection() {
  const t = await getTranslations("home")

  return (
    <section id="story" className="relative bg-[#f2f0eb] px-5 py-16 md:py-24">
      <div className="container mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_1fr] md:items-center">
        <div className="relative min-h-[330px] overflow-hidden rounded-[2rem] border border-[#dcd3c4] bg-[#fbf8f1] shadow-[0_16px_44px_rgba(35,27,16,0.08)]">
          <div className="absolute inset-8 rounded-[1.6rem] border border-[#1E3932]/10" />
          <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#1E3932] font-display text-3xl font-bold text-white shadow-[0_18px_40px_rgba(30,57,50,0.28)]">
            竹
          </div>
          <div className="absolute left-[20%] right-[20%] top-1/2 h-px bg-gradient-to-r from-transparent via-[#1E3932]/35 to-transparent" />
          <div className="absolute bottom-[24%] left-[24%] right-[18%] h-px rotate-[-16deg] bg-gradient-to-r from-transparent via-[#1E3932]/24 to-transparent" />
          <div className="absolute left-[38%] right-[16%] top-[30%] h-px rotate-[20deg] bg-gradient-to-r from-transparent via-[#1E3932]/24 to-transparent" />
          {NODES.map((position, index) => (
            <div
              key={position}
              className={`absolute ${position} size-5 rounded-full border border-[#1E3932]/20 bg-[#c6d8a5] shadow-[0_0_0_10px_rgba(198,216,165,0.22)] animate-float`}
              style={{ animationDelay: `${index * 0.28}s` }}
            />
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
            {t("storyKicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
            {t("storyTitle")}
          </h2>
          <p className="mt-4 text-sm leading-[1.9] text-muted-foreground md:text-base">
            {t("storySubtitle")}
          </p>
          <p className="mt-5 rounded-2xl bg-white/70 p-5 text-sm leading-[1.8] text-foreground/78 shadow-[0_10px_28px_rgba(35,27,16,0.05)]">
            {t("storyNote")}
          </p>
        </div>
      </div>
    </section>
  )
}
