import { Clock, CheckCircle, XCircle } from "lucide-react"

interface Props {
  status: string
  t: (key: string) => string
}

export function CancellationStatus({ status, t }: Props) {
  if (status === "pending") {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 flex items-start gap-3">
        <Clock className="size-5 text-yellow-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-yellow-700">{t("cancelPending")}</p>
          <p className="text-xs text-yellow-600 mt-1">{t("cancelPendingHint")}</p>
        </div>
      </div>
    )
  }

  if (status === "approved") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
        <CheckCircle className="size-5 text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-green-700">{t("cancelApproved")}</p>
        </div>
      </div>
    )
  }

  if (status === "rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
        <XCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-700">{t("cancelRejected")}</p>
          <p className="text-xs text-red-600 mt-1">{t("cancelRejectedHint")}</p>
        </div>
      </div>
    )
  }

  return null
}
