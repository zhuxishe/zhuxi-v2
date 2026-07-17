import Link from "next/link"
import { getLocale } from "next-intl/server"
import { ArrowLeft, Bell } from "lucide-react"
import { requireCommunityAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { fetchCommunitySelfData } from "@/lib/community/queries/me"
import { createAdminClient } from "@/lib/supabase/admin"
import { CommunityIdentityForm } from "./CommunityIdentityForm"
import { CommunitySelfLists } from "./CommunitySelfLists"
import { NotificationPreferencesForm } from "./NotificationPreferencesForm"

interface PageProps {
  searchParams: Promise<{ returnTo?: string; setup?: string }>
}

export default async function MyCommunityPage({ searchParams }: PageProps) {
  const [{ returnTo, setup }, context, rawLocale] = await Promise.all([
    searchParams,
    requireCommunityAccess(),
    getLocale(),
  ])
  const locale = normalizeCommunityLocale(rawLocale)
  const [data, identityResult] = await Promise.all([
    fetchCommunitySelfData(context.memberId),
    createAdminClient()
      .from("member_identity")
      .select("personal_avatar_path")
      .eq("member_id", context.memberId)
      .maybeSingle<{ personal_avatar_path: string | null }>(),
  ])
  const personalAvatarPath = identityResult.error ? null : identityResult.data?.personal_avatar_path ?? null

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="flex items-center gap-2">
        <Link href="/app/profile" aria-label="返回我的" className="grid size-11 place-items-center rounded-full hover:bg-primary/10"><ArrowLeft className="size-5" /></Link>
        <div>
          <h1 className="heading-display text-2xl">{locale === "ja" ? "マイコミュニティ" : "我的社区"}</h1>
          <p className="text-sm text-muted-foreground">{locale === "ja" ? "プロフィール、投稿、通知を管理" : "管理社区身份、内容与通知"}</p>
        </div>
      </div>

      {setup === "1" && !context.profile && (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
          {locale === "ja" ? "投稿やコメントの前にニックネームを設定してください。" : "发布或评论前，请先设置昵称。"}
        </p>
      )}
      <CommunityIdentityForm profile={context.profile} personalAvatarPath={personalAvatarPath} returnTo={returnTo} locale={locale} />

      <CommunitySelfLists data={data} locale={locale} />

      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2"><Bell className="size-5 text-primary" /><h2 className="font-semibold">{locale === "ja" ? "通知設定" : "通知设置"}</h2></div>
        <NotificationPreferencesForm preferences={data.preferences} locale={locale} />
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-soft">
        <h2 className="font-semibold">{locale === "ja" ? "利用制限" : "当前社区限制状态"}</h2>
        <p className={`mt-2 text-sm ${context.restriction ? "text-destructive" : "text-primary"}`}>
          {context.restriction?.reason || (locale === "ja" ? "現在、利用制限はありません" : "当前无社区限制")}
        </p>
      </section>
    </div>
  )
}
