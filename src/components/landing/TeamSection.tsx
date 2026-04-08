import { getTranslations } from "next-intl/server"

const MEMBERS = [
  { emoji: "👩‍🎓", name: "林芷萱", role: "社长", school: "东京大学 / 社会学" },
  { emoji: "👨‍💼", name: "陈柏宇", role: "副社长", school: "早稻田大学 / 经济学" },
  { emoji: "🎨", name: "张雨涵", role: "活动企划", school: "庆应义塾大学 / 设计" },
  { emoji: "💻", name: "王志明", role: "技术长", school: "明治大学 / 资工" },
  { emoji: "📢", name: "李佳颖", role: "公关长", school: "上智大学 / 国际关系" },
  { emoji: "📊", name: "刘浩然", role: "财务长", school: "东京工业大学 / 机械" },
]

export async function TeamSection() {
  const t = await getTranslations("home")

  return (
    <section id="team" className="section-padding">
      <div className="container mx-auto max-w-5xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("teamTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("teamSubtitle")}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {MEMBERS.map((m) => (
            <div key={m.name} className="landing-card p-6 text-center">
              <span className="text-3xl mb-3 block">{m.emoji}</span>
              <p className="font-display font-semibold">{m.name}</p>
              <p className="text-primary text-sm font-medium mt-1">{m.role}</p>
              <p className="text-muted-foreground text-xs mt-1">{m.school}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
