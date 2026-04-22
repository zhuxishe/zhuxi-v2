import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { fetchPublishedStaffProfiles } from "@/lib/queries/staff"

export async function StaffSection() {
  const t = await getTranslations("home")
  const staff = await fetchPublishedStaffProfiles()

  if (staff.length === 0) return null

  return (
    <section id="staff" className="section-padding relative pt-0">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold">
            <span className="gradient-text">{t("teamTitle")}</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            {t("teamSubtitle")}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => (
            <article key={member.id} className="landing-card p-6">
              <div className="flex items-center gap-4">
                <div className="relative size-14 overflow-hidden rounded-full bg-bamboo-muted text-bamboo">
                  {member.avatar_url ? (
                    <Image
                      src={member.avatar_url}
                      alt={member.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized={member.avatar_url.endsWith(".svg")}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-lg">
                      {member.name[0]}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold leading-tight">
                    {member.name}
                  </h3>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {member.school} · {member.major}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-foreground/80">
                {member.intro}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
