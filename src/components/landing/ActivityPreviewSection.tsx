import Link from "next/link"
import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { CalendarDays, Sparkles, UsersRound } from "lucide-react"
import { fetchLandingScripts } from "@/lib/queries/scripts"
import { rewriteStorageUrl } from "@/lib/storage-url"

const FALLBACK_CARDS = [
  { key: "1", icon: Sparkles },
  { key: "2", icon: UsersRound },
  { key: "3", icon: CalendarDays },
] as const

export async function ActivityPreviewSection() {
  const t = await getTranslations("home")
  const scripts = await fetchLandingScripts(3)

  return (
    <section id="activity-preview" className="relative bg-[#f2f0eb] px-5 py-16 md:py-20">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bamboo">
              {t("activityPreviewKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-foreground md:text-4xl">
              {t("activityPreviewTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              {t("activityPreviewSubtitle")}
            </p>
          </div>
          <Link
            href="/scripts"
            className="inline-flex w-fit items-center justify-center rounded-full border border-bamboo px-5 py-2.5 text-sm font-semibold text-bamboo transition-all duration-200 hover:bg-bamboo hover:text-white active:scale-95"
          >
            {t("activityPreviewCta")}
          </Link>
        </div>

        {scripts.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            {scripts.map((script) => (
              <Link key={script.id} href="/scripts" className="landing-card group overflow-hidden bg-white">
                <div className="relative aspect-[16/10] overflow-hidden bg-bamboo-muted">
                  {script.cover_url ? (
                    <Image
                      src={rewriteStorageUrl(script.cover_url)}
                      alt={script.title}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-bamboo">
                      <Sparkles className="size-9" />
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <h3 className="font-display text-lg font-semibold leading-snug">{script.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {script.player_count_min}-{script.player_count_max}{t("scriptPlayers")}
                    {script.location ? ` · ${script.location}` : ""}
                    {script.budget ? ` · ${script.budget}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {FALLBACK_CARDS.map(({ key, icon: Icon }) => (
              <div key={key} className="landing-card bg-white p-6">
                <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-bamboo-muted text-bamboo">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{t(`activityPreviewCard${key}Title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(`activityPreviewCard${key}Desc`)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
