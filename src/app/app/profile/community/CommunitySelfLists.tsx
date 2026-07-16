"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import {
  deleteCommunityPostAction,
  unblockCommunityProfileAction,
  unhideCommunityPostAction,
} from "@/app/app/community/actions"
import type { CommunitySelfData } from "@/lib/community/queries/me"

export function CommunitySelfLists({ data, locale }: { data: CommunitySelfData; locale: "zh" | "ja" }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState("")
  const label = (zh: string, ja: string) => locale === "ja" ? ja : zh
  const treeholes = data.posts.filter((post) => post.postType === "treehole")
  const photos = data.posts.filter((post) => post.postType === "photo")

  useEffect(() => {
    if (window.location.hash !== "#community-reports") return
    const reports = document.getElementById("community-reports")
    if (reports instanceof HTMLDetailsElement) reports.open = true
  }, [])

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError("")
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError(result.error || label("操作失败", "操作に失敗しました"))
      else router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <ManagementSection title={label("我的树洞", "自分のつぶやき")} count={treeholes.length} emptyLabel={label("暂无树洞", "まだありません")}>
        {treeholes.map((post) => (
          <ManagementRow key={post.id} href={`/app/community/treehole/${post.id}`} title={post.title || post.body || label("树洞", "つぶやき")}>
            <button type="button" onClick={() => run(() => deleteCommunityPostAction(post.id))} className="min-h-9 px-2 text-xs font-medium text-destructive">{label("删除", "削除")}</button>
          </ManagementRow>
        ))}
      </ManagementSection>

      <ManagementSection title={label("我的照片动态", "自分の写真投稿")} count={photos.length} emptyLabel={label("暂无照片动态", "まだありません")}>
        {photos.map((post) => (
          <ManagementRow key={post.id} href={`/app/community/photos/${post.id}`} title={post.body || label("照片动态", "写真投稿")}>
            <button type="button" onClick={() => run(() => deleteCommunityPostAction(post.id))} className="min-h-9 px-2 text-xs font-medium text-destructive">{label("删除", "削除")}</button>
          </ManagementRow>
        ))}
      </ManagementSection>

      <ManagementSection title={label("我的评论与回复", "自分のコメントと返信")} count={data.comments.length} emptyLabel={label("暂无内容", "まだありません")}>
        {data.comments.map((comment) => (
          <ManagementRow key={comment.id} href={`/app/community/${comment.postType === "photo" ? "photos" : "treehole"}/${comment.postId}`} title={comment.body || label("已删除评论", "削除済みコメント")} />
        ))}
      </ManagementSection>

      <ManagementSection title={label("我点赞的内容", "いいねした投稿")} count={data.likedPosts.length} emptyLabel={label("暂无内容", "まだありません")}>
        {data.likedPosts.map((post) => (
          <ManagementRow key={post.id} href={`/app/community/${post.postType === "photo" ? "photos" : "treehole"}/${post.id}`} title={post.title || post.body || label("照片动态", "写真投稿")} />
        ))}
      </ManagementSection>

      <ManagementSection id="community-reports" title={label("举报记录", "報告履歴")} count={data.reports.length} emptyLabel={label("暂无记录", "記録はありません")}>
        {data.reports.map((report) => (
          <div key={report.id} className="flex min-h-11 items-center justify-between border-b border-border/70 py-2 text-sm last:border-0">
            <span>{report.reason}</span><span className="text-xs text-muted-foreground">{report.status}</span>
          </div>
        ))}
      </ManagementSection>

      <ManagementSection title={label("已隐藏内容", "非表示にした投稿")} count={data.hiddenPosts.length} emptyLabel={label("暂无内容", "まだありません")}>
        {data.hiddenPosts.map((post) => (
          <ManagementRow key={post.id} href={`/app/community/${post.postType === "photo" ? "photos" : "treehole"}/${post.id}`} title={post.title || post.body || label("照片动态", "写真投稿")}>
            <button type="button" onClick={() => run(() => unhideCommunityPostAction(post.id))} className="min-h-9 px-2 text-xs font-medium text-primary">{label("恢复显示", "再表示")}</button>
          </ManagementRow>
        ))}
      </ManagementSection>

      <ManagementSection title={label("屏蔽名单", "ブロック一覧")} count={data.blockedProfiles.length} emptyLabel={label("暂无会员", "まだありません")}>
        {data.blockedProfiles.map((profile) => (
          <ManagementRow key={profile.id} href={`/app/community/profile/${profile.id}`} title={profile.nickname}>
            <button type="button" onClick={() => run(() => unblockCommunityProfileAction(profile.id))} className="min-h-9 px-2 text-xs font-medium text-primary">{label("解除", "解除")}</button>
          </ManagementRow>
        ))}
      </ManagementSection>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function ManagementSection({ id, title, count, emptyLabel, children }: { id?: string; title: string; count: number; emptyLabel: string; children: React.ReactNode }) {
  return (
    <details id={id} className="scroll-mt-24 rounded-2xl bg-card px-4 shadow-soft">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between font-semibold">
        <span>{title}</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{count}</span>
      </summary>
      <div className="pb-3">{count ? children : <p className="pb-3 text-sm text-muted-foreground">{emptyLabel}</p>}</div>
    </details>
  )
}

function ManagementRow({ href, title, children }: { href: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-border/70 last:border-0">
      <Link href={href} className="min-w-0 flex-1 truncate py-3 text-sm">{title}</Link>
      {children}
    </div>
  )
}
