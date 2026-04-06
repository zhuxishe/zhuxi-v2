import { requirePlayer } from "@/lib/auth/player"
import { fetchPlayerMatches } from "@/lib/queries/matching"
import { getTranslations } from "next-intl/server"
import { EmptyState } from "@/components/shared/EmptyState"
import { Users } from "lucide-react"
// Supabase returns nested joins as arrays or objects depending on FK type

export default async function PlayerMatchesPage() {
  const player = await requirePlayer()
  const t = await getTranslations("playerMatches")
  const matches = await fetchPlayerMatches(player.memberId)

  if (matches.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-6">{t("title")}</h1>
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      {matches.map((m) => {
        // Unwrap Supabase nested joins (may be array or object)
        const unwrap = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, unknown> | undefined
        const memberA = unwrap(m.member_a)
        const memberB = unwrap(m.member_b)
        const a = unwrap(memberA?.member_identity)
        const b = unwrap(memberB?.member_identity)
        const session = unwrap(m.session) as { session_name?: string } | undefined

        // Determine partner (the other person)
        const isA = (memberA?.id as string) === player.memberId
        const partner = isA ? b : a

        return (
          <div key={m.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {t("partner")}: {String(partner?.full_name ?? partner?.nickname ?? t("unknown"))}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {session?.session_name ?? ""} · {new Date(m.created_at).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-bold">
                {typeof m.total_score === "number" ? m.total_score.toFixed(0) : m.total_score} {t("points")}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
