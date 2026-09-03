export type AccountStatus = "active" | "suspended" | "closed" | "unbound"

export type ProfileStage = "not_started" | "in_progress" | "submitted" | "complete"

export type OnboardingStep = 1 | 2 | 3 | 4

export interface MemberMasterRecord {
  memberId: string
  created: boolean | null
  status: string
  accountStatus: AccountStatus | string
  profileStage: ProfileStage | string
  recordSource: string | null
  onboardingStep: number
  lastProfileSavedAt: string | null
  submittedAt: string | null
}

export interface OnboardingSaveRecord extends MemberMasterRecord {
  savedStep: OnboardingStep
}

export interface CanonicalMemberSnapshot {
  memberId: string
  memberNumber: string | null
  membershipType: string | null
  status: string
  accountStatus: AccountStatus | string
  profileStage: ProfileStage | string
  onboardingStep: number
  lastProfileSavedAt: string | null
  submittedAt: string | null
  fullName: string | null
  hasIdentity: boolean
}

export type MemberMasterActionError =
  | "accountBlocked"
  | "invalidStep"
  | "stepOutOfOrder"
  | "invalidPayload"
  | "requiredFieldsMissing"
  | "nicknameConflict"
  | "onboardingLocked"
  | "saveFailed"
  | "submitFailed"
