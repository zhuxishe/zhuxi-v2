import Link from "next/link"
import { registrationReturnHref, type RegistrationReturnContext } from "@/lib/registration-review-gate/navigation"

export function ReviewRegistrationReturn({ context, locale, completed, busy = false }: {
  context: RegistrationReturnContext | null; locale: string; completed: boolean; busy?: boolean
}) {
  if (!context) return null
  const ja = locale === "ja"
  return <aside className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4" aria-live="polite">
    <p className="text-sm leading-6">{completed
      ? ja ? "このイベントの評価は完了しました。申込画面に戻ると、ほかの未評価イベントも確認されます。" : "本场评分已完成。返回报名时会重新检查是否还有其他活动待评。"
      : ja ? "このイベントで一人の評価を保存したら、申込画面に戻って続けられます。" : "给本场一位符合条件的参与者保存评分后，可返回原活动继续报名。"}</p>
    {busy ? <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">{ja ? "送信中…" : "提交中…"}</span>
      : <Link href={registrationReturnHref(context)} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-primary underline underline-offset-4">{ja ? "申込画面に戻る" : "返回报名"}</Link>}
  </aside>
}
