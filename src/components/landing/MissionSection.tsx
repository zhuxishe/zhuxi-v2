import { useTranslations } from "next-intl"
import { BookOpen, Users, GraduationCap } from "lucide-react"

const FEATURES = [
  { key: "Academic", icon: BookOpen },
  { key: "Social", icon: Users },
  { key: "Campus", icon: GraduationCap },
] as const

export function MissionSection() {
  const t = useTranslations("home")

  return (
    <section id="mission" className="section-padding">
      <div className="container mx-auto max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("missionTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto mt-4">
          {t("missionSubtitle")}
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map(({ key, icon: Icon }) => (
            <div key={key} className="landing-card p-8">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
                <Icon size={24} className="text-primary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">
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
