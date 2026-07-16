"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Leaf, LockKeyhole, UserRound } from "lucide-react"
import { createTreeholeAction, updateCommunityPostAction } from "@/app/app/community/actions"
import { ComposerHeader } from "./ComposerHeader"
import type { CommunityActionState, CommunityProfile } from "@/lib/community/types"

const INITIAL_STATE: CommunityActionState = {}

interface TreeholeComposerProps {
  profile: CommunityProfile
  locale: "zh" | "ja"
  post?: import("@/lib/community/types").CommunityPost
}

export function TreeholeComposer({ profile, locale, post }: TreeholeComposerProps) {
  const router = useRouter()
  const serverAction = post
    ? updateCommunityPostAction.bind(null, post.id, "treehole" as const)
    : createTreeholeAction
  const [state, action, pending] = useActionState(serverAction, INITIAL_STATE)
  const [title, setTitle] = useState(post?.title ?? "")
  const [body, setBody] = useState(post?.body ?? "")
  const [identity, setIdentity] = useState<"public" | "anonymous">(post?.isAnonymous ? "anonymous" : "public")
  const dirty = title !== (post?.title ?? "") || body !== (post?.body ?? "")

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function goBack() {
    if (!dirty || window.confirm(locale === "ja" ? "編集中の内容を破棄しますか？" : "放弃未发布的内容？")) {
      router.back()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <ComposerHeader
        title={post ? (locale === "ja" ? "投稿を編集" : "编辑树洞") : (locale === "ja" ? "つぶやきを投稿" : "写树洞")}
        submitLabel={post ? (locale === "ja" ? "保存" : "保存") : (locale === "ja" ? "投稿" : "发布")}
        formId="treehole-composer"
        pending={pending}
        disabled={!body.trim()}
        onBack={goBack}
      />
      <form id="treehole-composer" action={action} className="space-y-5 px-4 py-5">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
          <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
            {profile.avatarKind === "preset" ? <Leaf className="size-5" /> : <UserRound className="size-5" />}
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{locale === "ja" ? "投稿者" : "发布身份"}</p>
            <p className="font-semibold">{identity === "anonymous" ? (locale === "ja" ? "匿名会員" : "匿名会员") : profile.nickname}</p>
          </div>
        </div>

        <fieldset disabled={Boolean(post)} className="grid grid-cols-2 gap-2 disabled:opacity-70" aria-label={locale === "ja" ? "投稿者の表示" : "发布身份"}>
          <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium ${identity === "public" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>
            <input className="sr-only" type="radio" name="identity" value="public" checked={identity === "public"} onChange={() => setIdentity("public")} />
            <UserRound className="size-4" />
            {locale === "ja" ? "コミュニティ名" : "社区身份"}
          </label>
          <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium ${identity === "anonymous" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>
            <input className="sr-only" type="radio" name="identity" value="anonymous" checked={identity === "anonymous"} onChange={() => setIdentity("anonymous")} />
            <LockKeyhole className="size-4" />
            {locale === "ja" ? "匿名" : "匿名发布"}
          </label>
        </fieldset>

        {identity === "anonymous" && (
          <p className="rounded-xl bg-primary/8 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {locale === "ja"
              ? "他の会員には匿名で表示されます。違反対応時は管理者が確認できます。"
              : "对其他会员匿名，管理员在违规处理时仍可追溯。"}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={60}
            placeholder={locale === "ja" ? "タイトル（任意）" : "标题（选填）"}
            className="min-h-13 w-full border-b border-border bg-transparent px-4 py-3 text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={12}
            required
            placeholder={locale === "ja" ? "共有したいことを書いてください……" : "写下你想分享的内容……"}
            className="w-full resize-none bg-transparent px-4 py-4 text-[15px] leading-7 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
          <div className="px-4 pb-3 text-right text-xs text-muted-foreground">{body.length} / 2000</div>
        </div>

        {state.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      </form>
    </div>
  )
}
