import Image from "next/image"
import Link from "next/link"
import { Banknote, MapPin, Users } from "lucide-react"
import { rewriteStorageUrl } from "@/lib/storage-url"

interface Activity {
  id: string
  title: string
  cover_url: string | null
  genre_tags: string[] | null
  player_count_min: number | null
  player_count_max: number | null
  budget: string | null
  location: string | null
}

interface Props {
  activity: Activity | null
  labels: {
    title: string
    fallbackTitle: string
    fallbackDesc: string
    view: string
    people: string
  }
}

export function PlayerHomeActivityCard({ activity, labels }: Props) {
  if (!activity) {
    return (
      <Link href="/app/scripts" className="block rounded-xl bg-card p-4 shadow-soft">
        <p className="text-xs font-semibold text-primary">{labels.title}</p>
        <h2 className="heading-display mt-2 text-xl">{labels.fallbackTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{labels.fallbackDesc}</p>
        <span className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
          {labels.view}
        </span>
      </Link>
    )
  }

  const cover = rewriteStorageUrl(activity.cover_url)

  return (
    <Link href={`/app/scripts/${activity.id}`} className="block overflow-hidden rounded-xl bg-card shadow-soft">
      <div className="relative min-h-52 bg-ink">
        {cover && (
          <Image src={cover} alt="" fill sizes="28rem" className="object-cover" priority />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/15 via-ink/25 to-ink/85" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="text-xs font-semibold text-white/75">{labels.title}</p>
          <h2 className="heading-display mt-2 text-2xl leading-tight">{activity.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {activity.genre_tags?.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-full bg-white/16 px-2.5 py-1 text-[11px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 text-[11px] text-muted-foreground">
        <Meta icon={Users} text={`${activity.player_count_min ?? 0}-${activity.player_count_max ?? 0}${labels.people}`} />
        <Meta icon={MapPin} text={activity.location ?? "-"} />
        <Meta icon={Banknote} text={activity.budget ?? "-"} />
      </div>
    </Link>
  )
}

function Meta({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1 rounded-lg bg-muted/60 px-2 py-2">
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  )
}
