export interface RoundAudienceMember {
  id: string
  name: string
  memberNumber: string | null
  isTest: boolean
  listed: boolean
  participated: boolean
  eligible: boolean
}

export interface RoundAudienceOperationSummary {
  operationId: string
  createdAt: string
  actorName: string
  enabled: boolean
  listedCount: number
}

export interface RoundAudienceSnapshot {
  roundId: string
  roundName: string
  isTest: boolean
  purpose: string
  status: string
  canManage: boolean
  enabled: boolean
  revision: string
  members: RoundAudienceMember[]
  counts: { listed: number; effective: number; formal: number; test: number }
  operations: RoundAudienceOperationSummary[]
}

export interface RoundAudienceSaveInput {
  roundId: string
  enabled: boolean
  memberIds: string[]
  expectedRevision: string
  operationId: string
  reason: string
}

export interface RoundAudienceSaveResult {
  success?: true
  error?: string
  unknown?: boolean
  operationId?: string
  revision?: string
}
