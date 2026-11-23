export type PeerNoMatchRequestStatus = "pending" | "resolved" | "closed"
export type PeerNoMatchRequestFilter = "all" | PeerNoMatchRequestStatus

export const PEER_NO_MATCH_STATUS_LABELS: Record<PeerNoMatchRequestStatus, string> = {
  pending: "待处理", resolved: "已处理", closed: "已关闭",
}

export interface AdminPeerNoMatchRequest {
  id: string
  roundId: string
  roundName: string
  requesterId: string
  requesterName: string
  targetMemberId: string
  targetName: string
  reason: string
  status: PeerNoMatchRequestStatus
  version: number
  createdAt: string
  updatedAt: string
  processedAt: string | null
  processedByName: string | null
  internalNote: string | null
  processingReason: string | null
}

export interface AdminPeerNoMatchRequestsPage {
  requests: AdminPeerNoMatchRequest[]
  total: number
  page: number
  pageSize: number
}

export type AdminPeerNoMatchRequestsResult =
  | { status: "ready"; data: AdminPeerNoMatchRequestsPage }
  | { status: "unavailable" }

export interface ResolvePeerNoMatchRequestInput {
  requestId: string
  status: "resolved" | "closed"
  expectedVersion: number
  internalNote: string
  reason: string
}

export type ResolvePeerNoMatchRequestResult = { success: true } | { error: string }
export type ResolvePeerNoMatchRequestAction = (input: ResolvePeerNoMatchRequestInput) => Promise<ResolvePeerNoMatchRequestResult>
