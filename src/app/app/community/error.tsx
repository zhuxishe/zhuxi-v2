"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useLocale } from "next-intl"
import { AlertCircle, RotateCcw } from "lucide-react"

export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useLocale()
  const label = (zh: string, ja: string) => locale.startsWith("ja") ? ja : zh
  useEffect(() => {
    console.error("[community page]", error)
  }, [error])

  return (
    <div className="px-4 py-12">
      <div className="rounded-[20px] bg-card px-5 py-10 text-center shadow-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">{label("社区暂时无法加载", "コミュニティを読み込めません")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{label("请检查网络后重新尝试。如果问题持续出现，请稍后再来。", "通信状況を確認して、もう一度お試しください。")}</p>
        <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
          <RotateCcw className="size-4" />{label("重新加载", "再読み込み")}
        </button>
        <Link href="/app" className="mt-2 flex min-h-11 items-center justify-center text-sm font-medium text-primary">{label("返回首页", "ホームに戻る")}</Link>
      </div>
    </div>
  )
}
