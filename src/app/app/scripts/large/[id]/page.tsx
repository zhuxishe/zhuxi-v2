import Image from "next/image"
import { notFound } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CalendarDays, ExternalLink, MapPin, Ticket, Users } from "lucide-react"
import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerLargeActivity } from "@/lib/player-activity/queries"
import { isUpcomingLargeActivity } from "@/lib/player-activity/selection"
import { rewriteStorageUrl } from "@/lib/storage-url"
import { formatTokyoDateTimeRange } from "@/lib/player-activity/tokyo-datetime"
import { ActivityPageIntro } from "@/components/player/activity/ActivityPageIntro"

interface LargeActivityDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LargeActivityDetailPage({ params }: LargeActivityDetailPageProps) {
  await requirePlayer()
  const [{ id }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations("activity"),
  ])
  const activity = await fetchPlayerLargeActivity(id, locale)
  if (!activity) notFound()

  const cover = rewriteStorageUrl(activity.coverUrl)
    ?? "/images/landing/mobile-redesign/activity-large-bg.webp"
  const badge = activity.status === "cancelled"
    ? t("badges.cancelled")
    : isUpcomingLargeActivity(activity) ? t("badges.upcoming") : t("badges.latest")
  const registrationUrl = safeExternalUrl(activity.registrationUrl)
  const gallery = activity.galleryUrls
    .map((url) => rewriteStorageUrl(url))
    .filter((url): url is string => Boolean(url && url !== cover))

  return (
    <article className="space-y-5 px-4 pb-7 pt-3">
      <ActivityPageIntro
        title={activity.title}
        backHref="/app/scripts/large"
        backLabel={t("backToLarge")}
      />

      <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-border bg-ink shadow-soft">
        <Image src={cover} alt="" fill priority sizes="(min-width: 448px) 416px, calc(100vw - 32px)" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/8" />
        <span className="absolute bottom-4 right-4 rounded-full border border-white/60 bg-white/92 px-3 py-1.5 text-xs font-semibold text-primary backdrop-blur-md">
          {badge}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-2 rounded-[20px] border border-border bg-card p-3 shadow-soft">
        <DetailMeta
          className="col-span-2"
          icon={CalendarDays}
          label={t("dateLabel")}
          value={formatTokyoDateTimeRange(activity.startAt, activity.endAt, locale, t("datePending"))}
        />
        <DetailMeta icon={MapPin} label={t("locationLabel")} value={activity.location ?? t("locationPending")} />
        <DetailMeta icon={Users} label={t("capacityLabel")} value={activity.capacityNote ?? t("detailPending")} />
        <DetailMeta icon={Ticket} label={t("feeLabel")} value={activity.feeNote ?? t("detailPending")} />
      </section>

      {activity.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activity.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{tag}</span>
          ))}
        </div>
      ) : null}

      <section className="rounded-[20px] border border-border bg-card p-4 shadow-soft">
        <h2 className="text-base font-semibold">{t("aboutActivity")}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
          {plainText(activity.content) || activity.summary || t("detailPending")}
        </p>
      </section>

      {gallery.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">{t("activityGallery")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {gallery.map((url, index) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-2xl bg-secondary">
                <Image src={url} alt={t("galleryImageAlt", { index: index + 1 })} fill sizes="(min-width: 448px) 202px, calc((100vw - 40px) / 2)" className="object-cover" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activity.status === "cancelled" ? (
        <p className="flex min-h-12 items-center justify-center rounded-xl bg-muted px-4 text-sm font-semibold text-muted-foreground" aria-disabled="true">
          {t("registrationCancelled")}
        </p>
      ) : registrationUrl ? (
        <a
          href={registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {t("registerExternal")}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      ) : (
        <p className="flex min-h-12 items-center justify-center rounded-xl bg-secondary px-4 text-sm font-semibold text-primary" aria-disabled="true">
          {t("registrationPending")}
        </p>
      )}
    </article>
  )
}

function DetailMeta({
  icon: Icon,
  label,
  value,
  className = "",
}: {
  icon: typeof CalendarDays
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={`min-w-0 rounded-xl bg-muted/70 p-3 ${className}`}>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="size-3.5" aria-hidden="true" />{label}</span>
      <span className="mt-1 block text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{value}</span>
    </div>
  )
}

function safeExternalUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? value : null
  } catch {
    return null
  }
}

function plainText(value: string | null) {
  return value?.replace(/<[^>]*>/g, "").trim() ?? ""
}
