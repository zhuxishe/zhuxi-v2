import { getTranslations } from "next-intl/server"
import { Users, MapPin, Wallet } from "lucide-react"
import { fetchLandingScripts } from "@/lib/queries/scripts"

export async function ScriptsSection() {
  const t = await getTranslations("home")
  const scripts = await fetchLandingScripts(6)

  return (
    <section id="scripts" className="section-padding bg-muted/50">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("scriptsTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("scriptsSubtitle")}
        </p>

        {scripts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground">{t("scriptsComingSoon")}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {scripts.map((script) => (
              <div key={script.id} className="landing-card p-6">
                {script.genre_tags?.[0] && (
                  <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-accent text-primary mb-3">
                    {script.genre_tags[0]}
                  </span>
                )}
                <h3 className="font-display font-semibold text-lg mb-3">
                  {script.title}
                </h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users size={14} />
                    <span>{script.player_count_min}-{script.player_count_max} {t("scriptPlayers")}</span>
                  </div>
                  {script.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} />
                      <span>{script.location}</span>
                    </div>
                  )}
                  {script.budget && (
                    <div className="flex items-center gap-2">
                      <Wallet size={14} />
                      <span>{script.budget}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
