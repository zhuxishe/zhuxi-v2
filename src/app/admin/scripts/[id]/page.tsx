import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAdminScriptV2 } from "@/lib/queries/admin-scripts"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ScriptAccessPanel, type AccessRecord } from "@/components/admin/ScriptAccessPanel"
import { ScriptPublishToggle } from "@/components/admin/ScriptPublishToggle"
import { ScriptDeleteButton } from "@/components/admin/ScriptDeleteButton"
import { TagBadge } from "@/components/shared/TagBadge"
import { rewriteStorageUrl } from "@/lib/storage-url"
import { fetchScriptAccessList } from "./actions"

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminScriptDetailPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  const script = await fetchAdminScriptV2(id)
  if (!script) notFound()
  const isArchived = Boolean(script.archived_at)
  const firstPagePreview = script.page_images?.find(Boolean) ?? null

  // 获取所有 approved 玩家（用于授权面板）
  const supabase = createAdminClient()
  const { data: members } = isArchived ? { data: [] } : await supabase
    .from("members")
    .select("id, member_identity(full_name)")
    .eq("record_scope", "current")
    .eq("account_status", "active")
    .eq("status", "approved")
    .eq("membership_type", "player")
  const allMembers = (members ?? []).map((m) => {
    const identity = Array.isArray(m.member_identity) ? m.member_identity[0] : m.member_identity
    return { id: m.id, name: (identity as { full_name?: string })?.full_name ?? m.id }
  })
  const accessResult = isArchived ? { data: [] } : await fetchScriptAccessList(id)

  return (
    <div>
      <AdminTopBar admin={admin} title={script.title} />
      <div className="p-6 max-w-2xl space-y-4">
        {script.cover_url && (
          <Image
            src={rewriteStorageUrl(script.cover_url)}
            alt={script.title}
            width={1200}
            height={480}
            unoptimized
            sizes="(min-width: 1024px) 42rem, 100vw"
            className="h-auto w-full max-h-48 rounded-xl object-cover"
          />
        )}

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{script.title}</h2>
            <div className="flex items-center gap-2">
              {!isArchived && (
                <Link
                  href={`/admin/scripts/${id}/edit`}
                  className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  编辑
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={script.is_published ? "text-emerald-700" : "text-muted-foreground"}>{script.is_published ? "官网显示" : "官网隐藏"}</span>
            <span>·</span>
            <span className={script.is_player_visible ? "text-emerald-700" : "text-muted-foreground"}>{script.is_player_visible ? "玩家端显示" : "玩家端隐藏"}</span>
            {isArchived && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">回收站</span>}
          </div>
          {script.title_ja && <p className="text-sm text-muted-foreground">{script.title_ja}</p>}
          <p className="text-sm">{script.description || "暂无简介"}</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground">人数</span><p className="font-medium">{script.player_count_min}-{script.player_count_max}人</p></div>
            <div><span className="text-xs text-muted-foreground">时长</span><p className="font-medium">{script.duration_minutes}分钟</p></div>
            <div><span className="text-xs text-muted-foreground">作者</span><p className="font-medium">{script.author || "-"}</p></div>
          </div>
        </div>

        {isArchived ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">此剧本已进入回收站，两端均不可见。</p>
            {script.archive_reason && <p className="mt-1 text-xs text-muted-foreground">归档理由：{script.archive_reason}</p>}
          </div>
        ) : (
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <ScriptPublishToggle
              scriptId={id}
              isPublished={script.is_published}
              isFeatured={script.is_featured}
              updatedAt={script.updated_at}
            />
          </div>
        )}

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-2">
          <p className="text-xs text-muted-foreground">题材</p>
          <div className="flex flex-wrap gap-1">{script.genre_tags?.map((t: string) => <TagBadge key={t} label={t} className="mr-1" />)}</div>
          <p className="text-xs text-muted-foreground mt-2">主题</p>
          <div className="flex flex-wrap gap-1">{script.theme_tags?.map((t: string) => <TagBadge key={t} label={t} variant="info" className="mr-1" />)}</div>
        </div>

        {script.page_image_paths.length > 0 ? (
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold mb-3">剧本预览</p>
            <div className="flex items-center gap-3">
              {firstPagePreview ? (
                <Image
                  src={rewriteStorageUrl(firstPagePreview)}
                  alt="剧本页面预览"
                  width={96}
                  height={128}
                  unoptimized
                  className="w-24 h-32 object-cover rounded border border-border"
                />
              ) : (
                <div className="grid h-32 w-24 place-items-center rounded border border-border bg-muted px-2 text-center text-xs text-muted-foreground">
                  预览链接生成失败，请刷新
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {script.page_image_paths.length} 页已转换
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

        {!isArchived && <ScriptAccessPanel scriptId={id} allMembers={allMembers} initialAccessList={accessResult.data as AccessRecord[]} />}
        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <ScriptDeleteButton
            scriptId={id}
            isArchived={isArchived}
            isSuperAdmin={admin.role === "super_admin"}
            updatedAt={script.updated_at}
          />
        </div>
      </div>
    </div>
  )
}
