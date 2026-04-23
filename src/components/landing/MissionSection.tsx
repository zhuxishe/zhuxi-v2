import { getTranslations } from "next-intl/server"
import { CalendarDays, ShieldCheck, UsersRound } from "lucide-react"

const FEATURES = [
  { key: "Academic", icon: CalendarDays },
  { key: "Social", icon: UsersRound },
  { key: "Campus", icon: ShieldCheck },
] as const

export async function MissionSection() {
  const t = await getTranslations("home")

  return (
    <section id="mission" className="relative bg-[#f2f0eb] px-5 py-16 md:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-10 grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
              {t("missionKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-5xl">
              {t("missionTitle")}
            </h2>
          </div>
          <p className="text-sm leading-[1.85] text-muted-foreground md:text-base">
            {t("missionSubtitle")}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }, i) => (
            <div
              key={key}
              id={key === "Social" ? "matching" : undefined}
              className="landing-card bg-white p-7 sm:p-8"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-bamboo-muted">
                <Icon size={20} className="text-bamboo" />
              </div>
              <h3 className="font-display text-lg font-semibold leading-snug">
                {t(`mission${key}`)}
              </h3>
              <p className="mt-3 text-sm leading-[1.85] text-muted-foreground">
                {t(`mission${key}Desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
