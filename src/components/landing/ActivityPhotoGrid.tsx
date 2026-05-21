import Image from "next/image"

const photos = [
  "bbq-01.webp",
  "shibuya-party-01.webp",
  "team-game-01.webp",
  "asakusa-01.webp",
  "showa-01.webp",
  "hogwarts-01.webp",
]

export function ActivityPhotoGrid({ title, subtitle, tags }: { title: string; subtitle: string; tags: string[] }) {
  return (
    <section className="rounded-[1.8rem] border border-[#e5dfd3] bg-white/88 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">{title}</p>
        <p className="mt-3 max-w-2xl text-sm leading-[1.9] text-[#4c5148] md:text-base">{subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[#5f8549]">
          {tags.map((tag, index) => (
            <span key={tag} className={`rounded-full px-4 py-2 ${index % 2 ? "bg-[#fff4c7]" : "bg-[#edf4e7]"}`}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {photos.map((name) => (
          <Image
            key={name}
            src={`/images/landing/activity-wall-20260520/${name}`}
            alt=""
            width={420}
            height={320}
            className="aspect-[4/3] w-full rounded-2xl object-cover shadow-[0_8px_22px_rgba(43,53,35,0.10)]"
          />
        ))}
      </div>
    </section>
  )
}
