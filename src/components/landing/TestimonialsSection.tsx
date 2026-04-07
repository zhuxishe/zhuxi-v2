import { useTranslations } from "next-intl"
import { Quote } from "lucide-react"

const TESTIMONIALS = [
  {
    quote: "刚来东京时什么都不熟，是社团的学长姐带我认识了这座城市，也交到了最好的朋友。",
    name: "小美",
    school: "早稻田大学",
  },
  {
    quote: "剧本杀之夜真的超好玩！认识了好多不同学校的人，每次活动都很期待。",
    name: "阿翔",
    school: "东京大学",
  },
  {
    quote: "就活分享会让我少走了很多弯路，前辈们的经验真的很宝贵。",
    name: "思涵",
    school: "庆应义塾大学",
  },
]

export function TestimonialsSection() {
  const t = useTranslations("home")

  return (
    <section id="testimonials" className="section-padding bg-muted/50">
      <div className="container mx-auto max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("testimonialsTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("testimonialsSubtitle")} ✨
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((item) => (
            <div key={item.name} className="landing-card p-8">
              <Quote size={20} className="text-primary/30 mb-4" />
              <p className="text-sm leading-relaxed text-foreground mb-6">
                「{item.quote}」
              </p>
              <div>
                <p className="font-display font-semibold text-sm">{item.name}</p>
                <p className="text-muted-foreground text-xs">{item.school}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
