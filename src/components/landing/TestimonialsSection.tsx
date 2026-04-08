import { getTranslations } from "next-intl/server"
import { fetchPublishedTestimonials } from "@/lib/queries/testimonials"

export async function TestimonialsSection() {
  const t = await getTranslations("home")
  const testimonials = await fetchPublishedTestimonials()

  if (testimonials.length === 0) return null

  return (
    <section id="testimonials" className="section-padding relative">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold">
            <span className="gradient-text">{t("testimonialsTitle")}</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-sm sm:text-base">
            {t("testimonialsSubtitle")}
          </p>
          <div className="ink-divider mt-8" />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((item) => (
            <div key={item.id} className="landing-card p-7 relative">
              {/* Large decorative quote — ink style */}
              <span
                className="absolute top-4 right-5 text-5xl font-display leading-none select-none"
                style={{ color: "oklch(0.45 0.08 155 / 0.08)" }}
              >
                &ldquo;
              </span>

              <p className="text-sm leading-[1.8] text-foreground/85 relative z-10 mb-6">
                {item.quote}
              </p>
              <div className="flex items-center gap-3">
                {/* Avatar circle with initial */}
                <div className="size-9 rounded-full bg-bamboo-muted flex items-center justify-center text-xs font-semibold text-bamboo">
                  {item.name[0]}
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">{item.name}</p>
                  {item.school && (
                    <p className="text-muted-foreground text-xs">{item.school}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
