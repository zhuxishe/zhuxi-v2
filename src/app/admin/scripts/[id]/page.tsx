import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchScript } from "@/lib/queries/scripts"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { TagBadge } from "@/components/shared/TagBadge"

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

  return (
    <div>
      <AdminTopBar admin={admin} title={script.title} />
      <div className="p-6 max-w-2xl space-y-4">
        {script.cover_url && (
          <img src={script.cover_url} alt={script.title} className="w-full max-h-48 object-cover rounded-xl" />
        )}

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{script.title}</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${script.is_published ? "bg-green-500/10 text-green-600" : "bg-orange-500/10 text-orange-500"}`}>
              {script.is_published ? "已发布" : "草稿"}
            </span>
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

        {script.pdf_url && (
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <p className="text-sm font-semibold mb-3">PDF 预览</p>
            <iframe src={script.pdf_url} className="w-full h-[500px] rounded-lg border border-border" />
          </div>
        )}
      </div>
    </div>
  )
}
