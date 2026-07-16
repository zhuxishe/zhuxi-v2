import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { requireCommunityAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { TreeholeComposer } from "../../_components/TreeholeComposer"

export default async function NewTreeholePage() {
  const [context, locale] = await Promise.all([requireCommunityAccess(), getLocale()])
  if (!context.canWrite) redirect("/app/community?tab=treehole")
  if (!context.profile) redirect("/app/profile/community?setup=1&returnTo=/app/community/treehole/new")
  return <TreeholeComposer profile={context.profile} locale={normalizeCommunityLocale(locale)} />
}
