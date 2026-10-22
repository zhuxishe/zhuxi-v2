export function canRunRoundMatching(status: string, windowState?: string) {
  return status === "closed"
    || (status === "open" && (windowState === "open" || windowState === "expired"))
}

export function canUpdateRoundStatus(currentStatus: string, nextStatus: string) {
  if (!["draft", "open", "closed", "matched"].includes(currentStatus)) return false
  if (currentStatus === "matched") return nextStatus === "matched"
  if (nextStatus === "matched") return false
  return ["draft", "open", "closed"].includes(nextStatus)
}
