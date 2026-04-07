import { useTranslations } from "next-intl"
import { Clock, Users } from "lucide-react"

const SCRIPTS = [
  { title: "暗夜追凶", genre: "推理", players: "6-8", duration: "180", emoji: "🔍" },
  { title: "樱花庄的秘密", genre: "情感", players: "5-6", duration: "150", emoji: "🌸" },
  { title: "东京幽灵事件簿", genre: "恐怖", players: "7-9", duration: "200", emoji: "👻" },
  { title: "校园七日谈", genre: "日常", players: "4-6", duration: "120", emoji: "🏫" },
  { title: "新宿迷踪", genre: "悬疑", players: "6-8", duration: "180", emoji: "🗼" },
  { title: "时间旅行者之约", genre: "科幻", players: "5-7", duration: "160", emoji: "⏳" },
]

export function ScriptsSection() {
  const t = useTranslations("home")

  return (
    <section id="scripts" className="section-padding bg-muted/50">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("scriptsTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("scriptsSubtitle")}
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {SCRIPTS.map((script) => (
            <div key={script.title} className="landing-card p-6">
              <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-accent text-primary mb-3">
                {script.genre}
              </span>
              <h3 className="font-display font-semibold text-lg mb-3">
                {script.emoji} {script.title}
              </h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users size={14} />
                  <span>{script.players} {t("scriptPlayers")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} />
                  <span>{script.duration} {t("scriptDuration")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
