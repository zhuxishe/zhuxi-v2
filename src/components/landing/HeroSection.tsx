import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { ChevronDown } from "lucide-react"

export async function HeroSection() {
  const t = await getTranslations("home")

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden grain-overlay">
      {/* Background image */}
      <Image
        src="/images/landing/campus-panorama.webp"
        alt="Panoramic Japanese campus"
        fill
        className="object-cover"
        priority
        sizes="100vw"
      />

      {/* Layered overlay -- warm retail-style green band over campus photography */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(90deg,
              oklch(0.18 0.04 155 / 86%) 0%,
              oklch(0.18 0.04 155 / 62%) 48%,
              oklch(0.18 0.04 155 / 30%) 100%
            ),
            linear-gradient(to bottom,
              transparent 0%,
              oklch(0.18 0.04 155 / 20%) 62%,
              #f2f0eb 100%
            )
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 text-left">
        {/* Decorative bamboo mark */}
        <div className="mb-6 flex items-center gap-3 animate-fade-in">
          <Image src="/logo.svg" alt="" width={44} height={44} loading="eager" className="size-11 opacity-95" />
          <span className="rounded-full bg-white/14 px-4 py-2 text-xs font-semibold tracking-[0.16em] text-white/80 backdrop-blur-sm">
            {t("heroKicker")}
          </span>
        </div>

        <h1 className="max-w-3xl text-4xl font-display font-bold text-white leading-[1.12] tracking-wide animate-fade-in-up sm:text-5xl lg:text-7xl">
          {t("heroTitle")}
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 animate-fade-in-up delay-1 sm:text-lg">
          {t("heroSubtitle")}
        </p>

        {/* CTA */}
        <div className="mt-9 flex flex-col gap-3 animate-fade-in-up delay-2 sm:flex-row">
          <a
            href="/scripts"
            className="inline-flex items-center justify-center rounded-full bg-[#00754A] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_8px_12px_rgba(0,0,0,0.14)] transition-all duration-200 hover:bg-[#006241] active:scale-95"
          >
            {t("heroCta")}
          </a>
          <a
            href="/login?next=/app/matching/survey"
            className="inline-flex items-center justify-center rounded-full border border-white/70 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white hover:text-[#1E3932] active:scale-95"
          >
            {t("heroSecondaryCta")}
          </a>
        </div>

        {/* Ink divider */}
        <div className="mt-12 h-px w-32 bg-gradient-to-r from-white/45 to-transparent animate-fade-in delay-3" />
      </div>

      {/* Scroll indicator */}
      <a
        href="#mission"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 animate-bounce-down"
      >
        <ChevronDown size={24} />
      </a>
    </section>
  )
}
