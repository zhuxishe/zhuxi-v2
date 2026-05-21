import Image from "next/image"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

export function PastReviewCard({ review, sourceLabel, photoUnitLabel }: { review: PastEventReviewPublic; sourceLabel: string; photoUnitLabel: string }) {
  const photoCount = 1 + review.gallery_urls.length

  return (
    <article id={`review-${review.id}`} className="scroll-mt-28 rounded-[1.6rem] border border-[#e5dfd3] bg-white/90 p-4 shadow-[0_14px_34px_rgba(43,53,35,0.08)] md:p-6">
      <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
        <header className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#6b8f4e]">{review.event_date}</p>
          <h2 className="mt-2 font-display text-[1.55rem] font-bold leading-tight md:mt-3 md:text-3xl">{review.title}</h2>
          <p className="mt-4 w-fit rounded-full bg-[#edf4e7] px-3 py-1 text-xs font-semibold text-[#5f8549]">
            {photoCount} {photoUnitLabel}
          </p>
          {review.source_url && (
            <Link href={review.source_url} target="_blank" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-bamboo">
              {sourceLabel}
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </header>
        <div>
          <Image
            src={review.cover_url}
            alt={review.title}
            width={1200}
            height={900}
            sizes="(min-width: 1024px) 760px, 92vw"
            className="mb-3 aspect-[4/3] w-full rounded-[1.1rem] bg-[#f4f0e8] object-cover shadow-[0_8px_20px_rgba(43,53,35,0.10)]"
          />
          <div className="columns-2 gap-3 md:columns-3">
          {review.gallery_urls.map((url, index) => (
            <Image
              key={url}
              src={url}
              alt={`${review.title} ${index + 1}`}
              width={900}
              height={1200}
              sizes="(min-width: 1024px) 260px, (min-width: 768px) 30vw, 46vw"
              className="mb-2 w-full break-inside-avoid rounded-[1rem] bg-[#f4f0e8] shadow-[0_8px_20px_rgba(43,53,35,0.10)] md:mb-3"
            />
          ))}
          </div>
        </div>
      </div>
    </article>
  )
}
