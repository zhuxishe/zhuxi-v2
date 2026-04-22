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
    <section id="mission" className="section-padding relative">
      <div className="container mx-auto max-w-5xl">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold">
            <span className="gradient-text">{t("missionTitle")}</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            {t("missionSubtitle")}
          </p>
          <div className="ink-divider mt-8" />
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {FEATURES.map(({ key, icon: Icon }, i) => (
            <div
              key={key}
              className="landing-card p-7 sm:p-8 text-center md:text-left"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="w-11 h-11 rounded-lg bg-bamboo-muted flex items-center justify-center mb-5 mx-auto md:mx-0">
                <Icon size={20} className="text-bamboo" />
              </div>
              <h3 className="font-display font-semibold text-base sm:text-lg mb-2">
                {t(`mission${key}`)}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t(`mission${key}Desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
