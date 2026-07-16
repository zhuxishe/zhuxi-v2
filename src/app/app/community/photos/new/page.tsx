import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { requireCommunityAccess } from "@/lib/auth/community"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { PhotoComposer } from "../../_components/PhotoComposer"

export default async function NewPhotoPage() {
  const [context, locale] = await Promise.all([requireCommunityAccess(), getLocale()])
  if (!context.canWrite) redirect("/app/community?tab=album")
  if (!context.profile) redirect("/app/profile/community?setup=1&returnTo=/app/community/photos/new")
  return <PhotoComposer profile={context.profile} locale={normalizeCommunityLocale(locale)} />
}
