export function canRunRoundMatching(status: string) {
  return status === "closed"
}

export function canUpdateRoundStatus(currentStatus: string, nextStatus: string) {
  if (currentStatus === "matched") return nextStatus === "matched"
  if (nextStatus === "matched") return false
  return ["draft", "open", "closed"].includes(nextStatus)
}
