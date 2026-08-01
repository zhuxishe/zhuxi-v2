import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { ComponentType } from "react"

export type ScriptsCategoryCardProps = {
  href: string
  image: string
  index: number
  title: string
  titleEn: string
  focus: string
  tags: readonly string[]
  body: string
  cta: string
  variant: "ghost" | "solid"
  Icon: ComponentType<{ className?: string }>
  featured?: boolean
}

export function ScriptsCategoryCard(props: ScriptsCategoryCardProps) {
  const { href, image, index, title, titleEn, focus, tags, body, cta, variant, Icon, featured = false } = props
  const buttonClass = variant === "solid"
    ? "bg-[#4f7d3c] text-white shadow-[0_10px_22px_rgba(79,125,60,0.28)] hover:bg-[#3f6d2f]"
    : "border border-[#9eb886] bg-[#eef4e7]/60 text-[#45613b] hover:bg-[#eef4e7]"

  return (
    <Link
      href={href}
      className={`group flex h-full overflow-hidden rounded-[1.45rem] border border-[#e5dfd3] bg-white/92 shadow-[0_20px_50px_rgba(44,55,35,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_58px_rgba(44,55,35,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f8549] focus-visible:ring-offset-4 motion-reduce:transform-none motion-reduce:transition-none ${featured ? "flex-col lg:col-span-2 lg:grid lg:grid-cols-[1.08fr_0.92fr]" : "flex-col"}`}
    >
      <div className={`relative overflow-hidden ${featured ? "h-56 lg:h-auto lg:min-h-[22rem]" : "h-48 md:h-56"}`}>
        <Image
          src={image}
          alt=""
          fill
          sizes={featured ? "(min-width: 1024px) 620px, 100vw" : "(min-width: 1024px) 480px, 100vw"}
          className="object-cover transition duration-700 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f150b]/78 via-[#0f150b]/16 to-[#0f150b]/24" />
        <span className="absolute left-4 top-4 grid size-9 place-items-center rounded-full border border-white/65 bg-[#141c10]/42 font-display text-base font-bold text-white backdrop-blur-sm">{index}</span>
        <div className="absolute bottom-5 left-5 text-white md:bottom-6 md:left-6">
          <h3 className={`font-display font-bold leading-none tracking-[0.05em] ${featured ? "text-3xl md:text-5xl" : "text-3xl md:text-4xl"}`}>{title}</h3>
          <span className="mt-2 block text-xs font-bold uppercase tracking-[0.34em] text-white/82">{titleEn}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 py-5 sm:px-5 md:p-7">
        <div className="flex items-start gap-2 text-[14px] font-bold leading-snug text-[#45613b] sm:text-base">
          <Icon className="mt-0.5 size-4 flex-none" />
          <span>{focus}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => <span key={tag} className="rounded-full bg-[#eef4e7] px-3 py-1.5 text-[13px] font-semibold text-[#45613b]">{tag}</span>)}
        </div>
        <p className="mt-4 text-sm leading-[1.85] text-[#4c5148] md:text-base">{body}</p>
        <div className="mt-auto flex justify-end pt-5">
          <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition motion-reduce:transition-none ${buttonClass}`}>
            {cta}
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </span>
        </div>
      </div>
    </Link>
  )
}
