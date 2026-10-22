import { redirect } from "next/navigation"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { MatchingCompletionRetry } from "@/components/player/MatchingCompletionRetry"
import { requirePlayer } from "@/lib/auth/player"
import { fetchMyMatchingReadiness } from "@/lib/matching/readiness-server"
import { matchingCompletionDestination, parseMatchingCompletionContext, type CompletionSearchParams } from "@/lib/matching/completion-flow"

export default async function MatchingProfileCompletionPage({ searchParams }: { searchParams: Promise<CompletionSearchParams> }) {
  await requirePlayer()
  const context = parseMatchingCompletionContext(await searchParams)
  if (!context) redirect("/app/profile")
  let destination: string
  try {
    destination = matchingCompletionDestination(await fetchMyMatchingReadiness(), context)
  } catch {
    const ja = await getLocale() === "ja"
    return <div className="p-6 space-y-4">
      <p role="alert">{ja ? "プロフィールの完了状況を読み込めませんでした。もう一度お試しください。" : "暂时无法读取资料完成状态，请重试。"}</p>
      <MatchingCompletionRetry label={ja ? "再試行" : "重试"} />
      <Link href="/app/matches" className="ml-4 text-muted-foreground underline">{ja ? "参加記録に戻る" : "返回参与记录"}</Link>
    </div>
  }
  redirect(destination)
}
