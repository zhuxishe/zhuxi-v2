export interface PendingApplicationItem {
  id: string
  fullName: string
  nickname: string | null
  schoolName: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  blockReason: string | null
}

export interface PendingApplicationsPage {
  items: PendingApplicationItem[]
  total: number
  page: number
  pageSize: number
}

export interface PendingApplicationApprovalResult {
  id: string
  success: boolean
  error?: string
}

export interface ApprovePendingApplicationsResult {
  error?: string
  results?: PendingApplicationApprovalResult[]
}
