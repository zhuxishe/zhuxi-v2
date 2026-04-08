import { getTranslations } from "next-intl/server"
import { Quote } from "lucide-react"
import { fetchPublishedTestimonials } from "@/lib/queries/testimonials"

export async function TestimonialsSection() {
  const t = await getTranslations("home")
  const testimonials = await fetchPublishedTestimonials()

  if (testimonials.length === 0) return null

  return (
    <section id="testimonials" className="section-padding bg-muted/50">
      <div className="container mx-auto max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("testimonialsTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("testimonialsSubtitle")}
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((item) => (
            <div key={item.id} className="landing-card p-8">
              <Quote size={20} className="text-primary/30 mb-4" />
              <p className="text-sm leading-relaxed text-foreground mb-6">
                {item.quote}
              </p>
              <div>
                <p className="font-display font-semibold text-sm">{item.name}</p>
                {item.school && (
                  <p className="text-muted-foreground text-xs">{item.school}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
