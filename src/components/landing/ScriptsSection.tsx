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
}

export async function ScriptsSection() {
  const locale = await getLocale()
  const copy = landingCopy(locale).activities
  const categories: CategoryCardProps[] = [
    {
      href: "/reviews",
      image: "/images/landing/activity-wall-20260520/daiba-03.webp",
      index: 1,
      title: copy.photoTitle,
      titleEn: copy.photoTitleEn,
      focus: copy.photoSubtitle,
      tags: copy.photoTags,
      body: copy.photoBody,
      cta: copy.photoCta,
      variant: "ghost",
      Icon: MapPin,
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
          <p className="text-xs font-bold tracking-[0.32em] text-[#7fa063] md:text-sm">{copy.eyebrow}</p>
          <h1 className="mt-3 font-display text-5xl font-bold leading-none tracking-[0.07em] text-[#1d2419] md:text-7xl">
            {copy.title}
          </h1>
          <div className="mt-5 flex items-center gap-4 text-[#7fa063]">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#9eb886]" />
            <Leaf className="size-5 rotate-45" />
            <span className="h-px w-16 bg-gradient-to-r from-[#9eb886] to-transparent" />
          </div>
          <div className="mt-6 max-w-2xl space-y-4 font-display text-base leading-[1.95] text-[#3c4636] md:text-xl">
            <p>{renderHighlightedText(copy.introLead, locale === "ja" ? ["オリジナル交流活動"] : ["原创社交活动"])}</p>
            <p className="font-sans text-sm leading-[1.9] text-[#4c5148] md:text-base">
              {renderHighlightedText(copy.introDetail, locale === "ja" ? ["初対面の緊張"] : ["降低初次见面的压力"])}
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Leaf className="size-5 text-[#5f8549]" />
            <h2 className="text-lg font-bold tracking-[0.08em] text-[#1d2419] md:text-xl">{copy.categoryTitle}</h2>
          </div>
          <p className="text-sm text-[#6b7163]">{copy.categoryHint}</p>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {categories.map((category) => (
            <CategoryCard key={category.href} {...category} />
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center font-display text-base leading-[2] text-[#4c5148] md:text-lg">
          {renderHighlightedText(copy.closing, locale === "ja" ? ["自分に合う参加の仕方"] : ["找到适合自己的参与方式"])}
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

function CategoryCard({ href, image, index, title, titleEn, focus, tags, body, cta, variant, Icon }: CategoryCardProps) {
  const buttonClass = variant === "solid"
    ? "bg-[#5f8549] text-white shadow-[0_10px_22px_rgba(79,125,60,0.28)] hover:bg-[#4f7d3c]"
    : "border border-[#9eb886] bg-[#eef4e7]/60 text-[#4f7d3c] hover:bg-[#eef4e7]"

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
        <span className="absolute left-5 top-5 grid size-11 place-items-center rounded-full border border-white/65 bg-[#141c10]/42 font-display text-lg font-bold text-white backdrop-blur-sm">
          {index}
        </span>
        <div className="absolute bottom-5 left-5 text-white">
          <h3 className="font-display text-3xl font-bold leading-none tracking-[0.05em] md:text-4xl">{title}</h3>
          <span className="mt-2 block text-xs font-bold uppercase tracking-[0.34em] text-white/82">{titleEn}</span>
        </div>
      </div>

      <div className="p-6 md:p-7">
        <div className="flex items-start gap-3 text-base font-bold leading-relaxed text-[#4f7d3c]">
          <Icon className="mt-1 size-5 flex-none" />
          <span>{focus}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#eef4e7] px-4 py-1.5 text-sm font-semibold text-[#4f7d3c]">
              {tag}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm leading-[1.9] text-[#4c5148] md:text-base">{body}</p>
        <span className={`mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition ${buttonClass}`}>
          {cta}
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
