import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

export function HeroSection() {
  const t = useTranslations("home")

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden grain-overlay">
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1920&q=80"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Layered overlay — ink wash gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(to bottom,
              oklch(0.12 0.015 50 / 55%) 0%,
              oklch(0.12 0.015 50 / 35%) 40%,
              oklch(0.12 0.015 50 / 50%) 70%,
              var(--background) 100%
            )
          `,
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
        {/* Decorative bamboo mark */}
        <div className="mb-6 animate-fade-in">
          <img src="/logo.png" alt="" className="size-12 mx-auto opacity-80" />
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-[1.15] tracking-wide animate-fade-in-up">
          {t("heroTitle")}
        </h1>

        <p className="mt-5 text-base sm:text-lg text-white/65 max-w-xl mx-auto leading-relaxed animate-fade-in-up delay-1">
          {t("heroSubtitle")}
        </p>

        {/* CTA */}
        <div className="mt-10 animate-fade-in-up delay-2">
          <a
            href="#scripts"
            className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-white/12 text-white font-medium text-sm border border-white/20 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 transition-all duration-300"
          >
            {t("heroCta")}
          </a>
        </div>

        {/* Ink divider */}
        <div className="mt-12 h-px w-24 mx-auto bg-gradient-to-r from-transparent via-white/25 to-transparent animate-fade-in delay-3" />
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
