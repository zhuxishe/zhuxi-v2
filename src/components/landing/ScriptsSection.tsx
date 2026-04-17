import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { Users, MapPin, Wallet } from "lucide-react"
import { fetchLandingScripts } from "@/lib/queries/scripts"
import { rewriteStorageUrl } from "@/lib/storage-url"

export async function ScriptsSection() {
  const t = await getTranslations("home")
  const scripts = await fetchLandingScripts(6)

  return (
    <section id="scripts" className="section-padding relative" style={{ background: "var(--washi-dark, var(--muted))" }}>
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold">
            <span className="gradient-text">{t("scriptsTitle")}</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-sm sm:text-base">
            {t("scriptsSubtitle")}
          </p>
          <div className="ink-divider mt-8" />
        </div>

        {scripts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground font-display">{t("scriptsComingSoon")}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {scripts.map((script) => (
              <div key={script.id} className="landing-card overflow-hidden group">
                {/* Cover */}
                <div className="aspect-[4/5] bg-muted relative overflow-hidden">
                  {script.cover_url ? (
                    <Image
                      src={rewriteStorageUrl(script.cover_url)}
                      alt={script.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-bamboo-muted">
                      <span className="text-4xl opacity-40">📖</span>
                    </div>
                  )}
                  {/* Genre badge */}
                  {script.genre_tags?.[0] && (
                    <span className="absolute top-3 left-3 text-[11px] font-medium px-2.5 py-1 rounded-full bg-ink/50 text-white backdrop-blur-sm border border-white/10">
                      {script.genre_tags[0]}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 space-y-2">
                  <h3 className="font-display font-semibold text-[15px] leading-snug">
                    {script.title}
                  </h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} />
                      {script.player_count_min}-{script.player_count_max}{t("scriptPlayers")}
                    </span>
                    {script.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} />
                        {script.location}
                      </span>
                    )}
                    {script.budget && (
                      <span className="inline-flex items-center gap-1">
                        <Wallet size={11} />
                        {script.budget}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
