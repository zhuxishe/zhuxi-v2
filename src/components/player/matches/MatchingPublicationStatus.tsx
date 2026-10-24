import type { MatchingPublication } from "@/lib/matching/publication-display"

interface Props {
  publications: MatchingPublication[]
  labels: { unmatched: string; waiting: string; withdrawn: string; cancelled: string }
}

export function MatchingPublicationStatus({ publications, labels }: Props) {
  return publications.filter((item) => item.status !== "matched").map((item) => (
    <div key={item.round_id} className="rounded-xl bg-card p-4 shadow-soft" role="status">
      <p className="text-sm font-semibold">{item.round_name}</p>
      <p className="mt-2 text-sm text-muted-foreground">{labels[item.status as keyof Pick<Props["labels"], "unmatched" | "waiting" | "withdrawn" | "cancelled">]}</p>
    </div>
  ))
}
