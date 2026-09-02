const STATUS_VALUES = new Set([
  "all",
  "pending",
  "approved",
  "rejected",
  "inactive",
])

const ACCOUNT_STATUS_VALUES = new Set([
  "active",
  "suspended",
  "closed",
])

const PROFILE_STAGE_VALUES = new Set([
  "all",
  "not_started",
  "in_progress",
  "submitted",
  "complete",
])

const RECORD_SOURCE_VALUES = new Set([
  "all",
  "app",
  "line",
  "admin",
])

function allowedValue(
  value: string | undefined,
  allowed: ReadonlySet<string>,
  fallback: string,
) {
  return value && allowed.has(value) ? value : fallback
}

export function normalizeCurrentMemberDirectoryFilters(input: {
  status?: string
  accountStatus?: string
  profileStage?: string
  source?: string
}) {
  return {
    status: allowedValue(input.status, STATUS_VALUES, "all"),
    accountStatus: allowedValue(input.accountStatus, ACCOUNT_STATUS_VALUES, "active"),
    profileStage: allowedValue(input.profileStage, PROFILE_STAGE_VALUES, "all"),
    recordSource: allowedValue(input.source, RECORD_SOURCE_VALUES, "all"),
  }
}
