import Image from "next/image"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { ArrowRight, Leaf, MapPin, Sparkles } from "lucide-react"
import type { ComponentType } from "react"
import { landingCopy } from "@/lib/landing-copy"

type CategoryCardProps = {
  href: string
  image: string
  index: number
  title: string
  titleEn: string
  focus: string
  tags: string[]
  body: string
  cta: string
  variant: "ghost" | "solid"
  Icon: ComponentType<{ className?: string }>
  wideBody?: boolean
  singleLineFocus?: boolean
}

export async function ScriptsSection() {
  const locale = await getLocale()
  const copy = landingCopy(locale).activities
  const categories: CategoryCardProps[] = [
    {
      href: "/reviews",
      image: "/images/landing/activity-wall-20260520/bbq-01.webp",
      index: 1,
      title: copy.photoTitle,
      titleEn: copy.photoTitleEn,
      focus: copy.photoSubtitle,
      tags: copy.photoTags,
      body: copy.photoBody,
      cta: copy.photoCta,
      variant: "ghost",
      Icon: MapPin,
      wideBody: true,
      singleLineFocus: locale !== "ja",
    },
    {
      href: "/scripts/library",
      image: "/images/landing/activity-wall-20260520/boardgame-01.webp",
      index: 2,
      title: copy.scriptTeaserTitle,
      titleEn: copy.scriptTeaserTitleEn,
      focus: copy.scriptTeaserSubtitle,
      tags: copy.scriptTeaserTags,
      body: copy.scriptTeaserBody,
      cta: copy.scriptTeaserCta,
      variant: "solid",
      Icon: Sparkles,
      wideBody: true,
      singleLineFocus: locale !== "ja",
    },
  ]

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] px-5 pb-16 pt-24 text-[#171717] grain-overlay md:pb-24 md:pt-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] overflow-hidden">
        <Image
          src="/images/landing/activity-wall-20260520/shibuya-party-01.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#fffdf7]/78 via-[#fffdf7]/88 to-[#fffdf7]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.94),rgba(255,253,247,0.44)_42%,rgba(255,253,247,0.92)_82%)]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <h1 className="font-display text-5xl font-bold leading-none tracking-[0.07em] text-[#1d2419] md:text-7xl">
            {copy.title}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-[#7fa063]">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#9eb886]" />
            <Leaf className="size-4 rotate-45" />
            <span className="h-px w-10 bg-gradient-to-r from-[#9eb886] to-transparent" />
          </div>
          <div className="mt-4 max-w-2xl space-y-3 text-base leading-[1.75] text-[#3c4636] md:text-lg">
            <p>{renderHighlightedText(copy.introLead, locale === "ja" ? ["オリジナル交流活動"] : ["原创社交活动"])}</p>
            <p>
              {renderHighlightedText(copy.introDetail, locale === "ja" ? ["初対面の緊張"] : ["活动前", "活动中", "活动后", "避免初次见面时的尴尬与压力。"])}
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Leaf className="size-5 text-[#5f8549]" />
            <h2 className="text-lg font-bold tracking-[0.08em] text-[#1d2419] md:text-xl">{copy.categoryTitle}</h2>
          </div>
          <p className="min-w-0 text-sm leading-none text-[#6b7163]">{copy.categoryHint}</p>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {categories.map((category) => (
            <CategoryCard key={category.href} {...category} />
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center font-display text-base leading-[2] text-[#4c5148] md:text-lg">
          {renderHighlightedText(copy.closing, locale === "ja" ? ["自分に合う参加の仕方"] : ["找到更适合自己的参与方式。"])}
        </p>
      </div>
    </section>
  )
}

function renderHighlightedText(text: string, highlights: string[]) {
  if (highlights.length === 0) return text

  const pattern = new RegExp(`(${highlights.map(escapeRegExp).join("|")})`, "g")
  return text.split(pattern).map((part, index) => (
    highlights.includes(part)
      ? <strong key={`${part}-${index}`} className="font-bold text-[#4f7d3c]">{part}</strong>
      : part
  ))
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function CategoryCard({ href, image, index, title, titleEn, focus, tags, body, cta, variant, Icon, wideBody = false, singleLineFocus = false }: CategoryCardProps) {
  const buttonColorClass = variant === "solid"
    ? "bg-[#5f8549] text-white shadow-[0_10px_22px_rgba(79,125,60,0.28)] hover:bg-[#4f7d3c]"
    : "border border-[#9eb886] bg-[#eef4e7]/60 text-[#4f7d3c] hover:bg-[#eef4e7]"
  const bodyClass = wideBody ? "px-4 py-5 sm:px-5 md:p-7" : "p-6 md:p-7"
  const focusClass = wideBody
    ? "flex items-center gap-2 text-[14px] font-bold leading-snug text-[#4f7d3c] sm:text-base"
    : "flex items-start gap-3 text-base font-bold leading-relaxed text-[#4f7d3c]"
  const iconClass = wideBody ? "size-4 flex-none" : "mt-1 size-5 flex-none"
  const tagsClass = wideBody ? "mt-4 flex flex-nowrap gap-1.5" : "mt-4 flex flex-wrap gap-2"
  const tagClass = wideBody
    ? "rounded-full bg-[#eef4e7] px-3 py-1.5 text-[13px] font-semibold text-[#4f7d3c]"
    : "rounded-full bg-[#eef4e7] px-4 py-1.5 text-sm font-semibold text-[#4f7d3c]"
  const bodyTextClass = wideBody ? "mt-4 text-sm leading-[1.85] text-[#4c5148] md:text-base" : "mt-4 text-sm leading-[1.9] text-[#4c5148] md:text-base"
  const buttonWrapClass = wideBody ? "mt-4 flex justify-end" : "mt-6"
  const buttonSizeClass = wideBody ? "px-4 py-2.5" : "px-5 py-3"

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-[1.45rem] border border-[#e5dfd3] bg-white/92 shadow-[0_20px_50px_rgba(44,55,35,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_58px_rgba(44,55,35,0.18)]"
    >
      <div className="relative h-48 overflow-hidden md:h-56">
        <Image
          src={image}
          alt=""
          fill
          sizes="(min-width: 1024px) 480px, 100vw"
          className="object-cover transition duration-700 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f150b]/78 via-[#0f150b]/16 to-[#0f150b]/24" />
        <span className="absolute left-3 top-3 grid size-9 place-items-center rounded-full border border-white/65 bg-[#141c10]/42 font-display text-base font-bold text-white backdrop-blur-sm md:left-4 md:top-4">
          {index}
        </span>
        <div className="absolute bottom-5 left-5 text-white">
          <h3 className="font-display text-3xl font-bold leading-none tracking-[0.05em] md:text-4xl">{title}</h3>
          <span className="mt-2 block text-xs font-bold uppercase tracking-[0.34em] text-white/82">{titleEn}</span>
        </div>
      </div>

      <div className={bodyClass}>
        <div className={focusClass}>
          <Icon className={iconClass} />
          <span className={singleLineFocus ? "whitespace-nowrap" : undefined}>{focus}</span>
        </div>
        <div className={tagsClass}>
          {tags.map((tag) => (
            <span key={tag} className={tagClass}>
              {tag}
            </span>
          ))}
        </div>
        <p className={bodyTextClass}>{body}</p>
        <div className={buttonWrapClass}>
          <span className={`inline-flex items-center gap-2 rounded-full ${buttonSizeClass} text-sm font-bold transition ${buttonColorClass}`}>
            {cta}
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}
