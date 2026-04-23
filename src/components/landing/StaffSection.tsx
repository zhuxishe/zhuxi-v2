import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { fetchPublishedStaffProfiles } from "@/lib/queries/staff"

export async function StaffSection() {
  const t = await getTranslations("home")
  const staff = await fetchPublishedStaffProfiles()

  if (staff.length === 0) return null

  return (
    <section id="staff" className="relative bg-[#fbf8f1] px-5 py-16 md:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-10 grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
              {t("teamKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-5xl">
              {t("teamTitle")}
            </h2>
          </div>
          <p className="text-sm leading-[1.85] text-muted-foreground md:text-base">
            {t("teamSubtitle")}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => (
            <article key={member.id} className="landing-card bg-white p-7 text-center">
              <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-[#f4eee4] p-2">
                <div className="relative size-20 overflow-hidden rounded-full bg-bamboo-muted text-bamboo">
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
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold leading-tight">
                {member.name}
              </h3>
              <p className="mt-2 text-xs font-medium leading-snug text-[#9b5a4c]">
                {member.school} · {member.major}
              </p>
              <p className="mt-5 text-sm leading-[1.8] text-foreground/78">
                {member.intro}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
