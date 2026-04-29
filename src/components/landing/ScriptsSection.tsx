import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { MapPin, Sparkles, Users, Wallet } from "lucide-react"
import { fetchLandingScripts } from "@/lib/queries/scripts"
import { rewriteStorageUrl } from "@/lib/storage-url"

export async function ScriptsSection() {
  const t = await getTranslations("home")
  const scripts = await fetchLandingScripts(6)

  return (
    <section id="featured-activities" className="relative min-h-screen bg-[#f2f0eb] px-5 pb-20 pt-28 md:pt-32">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-10 rounded-[2rem] bg-[#1E3932] px-6 py-10 text-white shadow-[0_0_6px_rgba(0,0,0,0.20),0_8px_12px_rgba(0,0,0,0.12)] md:px-10 md:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
            {t("scriptsPageKicker")}
          </p>
          <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
                {t("scriptsTitle")}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 md:text-base">
                {t("scriptsSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {scripts.length === 0 ? (
          <div className="landing-card bg-white p-10 text-center">
            <Sparkles className="mx-auto mb-4 size-9 text-bamboo" />
            <p className="font-display text-lg text-muted-foreground">{t("scriptsComingSoon")}</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {scripts.map((script) => (
              <article key={script.id} className="landing-card group overflow-hidden bg-white">
                <div className="relative aspect-[16/10] overflow-hidden bg-bamboo-muted">
                  {script.cover_url ? (
                    <Image
                      src={rewriteStorageUrl(script.cover_url)}
                      alt={script.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-bamboo">
                      <Sparkles className="size-9" />
                    </div>
                  )}
                  {script.genre_tags?.[0] && (
                    <span className="absolute left-3 top-3 rounded-full bg-[#1E3932]/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                      {script.genre_tags[0]}
                    </span>
                  )}
                </div>

                <div className="space-y-3 p-5">
                  <h2 className="font-display text-lg font-semibold leading-snug">
                    {script.title}
                  </h2>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f0eb] px-2.5 py-1">
                      <Users className="size-3" />
                      {script.player_count_min}-{script.player_count_max}{t("scriptPlayers")}
                    </span>
                    {script.location && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f0eb] px-2.5 py-1">
                        <MapPin className="size-3" />
                        {script.location}
                      </span>
                    )}
                    {script.budget && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f0eb] px-2.5 py-1">
                        <Wallet className="size-3" />
                        {script.budget}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
