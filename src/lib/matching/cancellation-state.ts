/** Only a request owned by the still-current published result is actionable. */
export function isCurrentCancellationRequest(row: {
  status: string
  publication_version: number
  cancellation_status: string | null
  cancellation_publication_version: number | null
  session: unknown
}): boolean {
  const session = (Array.isArray(row.session) ? row.session[0] : row.session) as
    | { status?: string; publication_version?: number }
    | null
    | undefined
  return row.status === "confirmed"
    && row.cancellation_status === "pending"
    && row.cancellation_publication_version !== null
    && row.cancellation_publication_version > 0
    && row.cancellation_publication_version === row.publication_version
    && session?.status === "confirmed"
    && session.publication_version === row.cancellation_publication_version
}
