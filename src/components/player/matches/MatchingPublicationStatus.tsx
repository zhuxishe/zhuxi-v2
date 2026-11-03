import type { MatchingPublication } from "@/lib/matching/publication-display"

interface Props {
  publications: MatchingPublication[]
  labels: { unmatched: string; waiting: string; withdrawn: string; cancelled: string; staffMessage?: string }
}

export function MatchingPublicationStatus({ publications, labels }: Props) {
  return publications.filter((item) => item.status !== "matched").map((item) => (
    <div key={item.round_id} className="rounded-xl bg-card p-4 shadow-soft" role="status">
      <p className="text-sm font-semibold">{item.round_name}</p>
      <p className="mt-2 text-sm text-muted-foreground">{labels[item.status as keyof Pick<Props["labels"], "unmatched" | "waiting" | "withdrawn" | "cancelled">]}</p>
      {item.status === "unmatched" && typeof item.unmatched_message === "string" && item.unmatched_message.trim() && <div className="mt-4 rounded-lg border border-border/70 bg-muted/30 p-3">
        <p className="text-xs font-medium text-primary">{labels.staffMessage ?? "工作人员留言"}</p>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{item.unmatched_message.trim()}</p>
      </div>}
    </div>
  ))
}
