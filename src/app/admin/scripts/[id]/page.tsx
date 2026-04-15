import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { fetchScript } from "@/lib/queries/scripts"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ScriptAccessPanel } from "@/components/admin/ScriptAccessPanel"
import { ScriptPublishToggle } from "@/components/admin/ScriptPublishToggle"
import { ScriptDeleteButton } from "@/components/admin/ScriptDeleteButton"
import { TagBadge } from "@/components/shared/TagBadge"
import { rewriteStorageUrl } from "@/lib/storage-url"

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminScriptDetailPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let script
  try {
    script = await fetchScript(id)
  } catch {
    notFound()
  }

  // 获取所有 approved 玩家（用于授权面板）
  const supabase = await createClient()
  const { data: members } = await supabase
    .from("members")
    .select("id, member_number, member_identity(full_name)")
    .eq("status", "approved")
    .eq("membership_type", "player")
  const allMembers = (members ?? []).map((m) => {
    const identity = Array.isArray(m.member_identity) ? m.member_identity[0] : m.member_identity
    return { id: m.id, name: (identity as { full_name?: string })?.full_name ?? m.id, memberNumber: m.member_number }
  })

  return (
    <div>
      <AdminTopBar admin={admin} title={script.title} />
      <div className="p-6 max-w-2xl space-y-4">
        {script.cover_url && (
          <img src={rewriteStorageUrl(script.cover_url)} alt={script.title} className="w-full max-h-48 object-cover rounded-xl" />
        )}

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{script.title}</h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/scripts/${id}/edit`}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                编辑
              </Link>
              <ScriptPublishToggle scriptId={id} isPublished={script.is_published} />
              <ScriptDeleteButton scriptId={id} />
            </div>
          </div>
          {script.title_ja && <p className="text-sm text-muted-foreground">{script.title_ja}</p>}
          <p className="text-sm">{script.description || "暂无简介"}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground">人数</span><p className="font-medium">{script.player_count_min}-{script.player_count_max}人</p></div>
            <div><span className="text-xs text-muted-foreground">时长</span><p className="font-medium">{script.duration_minutes}分钟</p></div>
            <div><span className="text-xs text-muted-foreground">作者</span><p className="font-medium">{script.author || "-"}</p></div>
          </div>
        </div>

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-2">
          <p className="text-xs text-muted-foreground">题材</p>
          <div className="flex flex-wrap gap-1">{script.genre_tags?.map((t: string) => <TagBadge key={t} label={t} className="mr-1" />)}</div>
          <p className="text-xs text-muted-foreground mt-2">主题</p>
          <div className="flex flex-wrap gap-1">{script.theme_tags?.map((t: string) => <TagBadge key={t} label={t} variant="info" className="mr-1" />)}</div>
        </div>

        {script.page_images && script.page_images.length > 0 ? (
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold mb-3">剧本预览</p>
            <div className="flex items-center gap-3">
              <img
                src={rewriteStorageUrl(script.page_images[0])}
                alt="第一页"
                className="w-24 h-32 object-cover rounded border border-border"
              />
              <span className="text-sm text-muted-foreground">
                {script.page_images.length} 页已转换
              </span>
            </div>
          </div>
        ) : script.pdf_url ? (
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold mb-2">剧本文件</p>
            <p className="text-xs text-muted-foreground">
              PDF 已上传但未转换为图片。请进入编辑页面进行转换。
            </p>
          </div>
        ) : null}

        <ScriptAccessPanel scriptId={id} allMembers={allMembers} />
      </div>
    </div>
  )
}
