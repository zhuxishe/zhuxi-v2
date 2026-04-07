import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

export function HeroSection() {
  const t = useTranslations("home")

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1920&q=80"
        alt="Tokyo campus"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(rgba(18,23,33,0.6), rgba(18,23,33,0.4), var(--background))",
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-tight">
          {t("heroTitle")}
        </h1>
        <p className="mt-6 text-lg text-white/75 max-w-2xl mx-auto">
          {t("heroSubtitle")}
        </p>
        <a
          href="#scripts"
          className="mt-8 inline-flex items-center justify-center px-8 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
        >
          {t("heroCta")}
        </a>
      </div>

      {/* Scroll indicator */}
      <a
        href="#mission"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 animate-bounce-down"
      >
        <ChevronDown size={28} />
      </a>
    </section>
  )
}
