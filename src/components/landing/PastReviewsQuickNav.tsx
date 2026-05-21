import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

export function PastReviewsQuickNav({ reviews }: { reviews: PastEventReviewPublic[] }) {
  return (
    <nav className="sticky top-[5.1rem] z-20 -mx-5 mb-5 overflow-x-auto border-y border-[#e5dfd3] bg-[#fffdf7]/80 px-5 py-1.5 backdrop-blur-xl md:top-24 md:mx-0 md:rounded-full md:border">
      <div className="flex w-max gap-2 py-0.5">
        {reviews.map((review) => (
          <a
            key={review.id}
            href={`#review-${review.id}`}
            className="grid min-h-11 place-items-center rounded-full bg-white px-4 text-xs font-semibold text-[#4f6f3e] shadow-[0_6px_16px_rgba(43,53,35,0.07)] transition hover:bg-[#edf4e7]"
          >
            {review.title}
          </a>
        ))}
      </div>
    </nav>
  )
}
