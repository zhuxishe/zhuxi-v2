import Image from "next/image"
import { getLocale } from "next-intl/server"
import { Leaf, MapPin, Sparkles, UsersRound } from "lucide-react"
import { ScriptsCategoryCard, type ScriptsCategoryCardProps } from "@/components/landing/ScriptsCategoryCard"
import { landingCopy } from "@/lib/landing-copy"

export async function ScriptsSection() {
  const locale = await getLocale()
  const copy = landingCopy(locale).activities
  const categories: ScriptsCategoryCardProps[] = [
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
    {
      href: "/scripts/collective-social",
      image: "/images/landing/collective-social/collective-social-hero.png",
      index: 3,
      title: copy.collectiveTitle,
      titleEn: copy.collectiveTitleEn,
      focus: copy.collectiveSubtitle,
      tags: copy.collectiveTags,
      body: copy.collectiveBody,
      cta: copy.collectiveCta,
      variant: "solid",
      Icon: UsersRound,
      featured: true,
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

      <div className="relative mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-[0.05em] text-[#1d2419] md:text-4xl">
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
            <ScriptsCategoryCard key={category.href} {...category} />
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center font-display text-base leading-[2] text-[#4c5148] md:text-lg">
          {renderHighlightedText(copy.closing, locale === "ja" ? ["自分に合う参加の形"] : ["适合自己的参与方式"])}
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
