export type PlayerActivityLocale = "zh" | "ja"

export type LargeActivityStatus = "draft" | "published" | "cancelled"
export type LargeActivityRegistrationStatus = "open" | "closed" | "coming_soon" | "ended"

export interface PlayerActivitySettings {
  largeActivitiesEnabled: boolean
  socialScriptsEnabled: boolean
  scriptLibraryEnabled: boolean
  largeHomeLimit: number
  socialHomeLimit: number
}

export type PlayerScriptLibrarySort = "recommended" | "newest"

export interface PlayerScriptLibraryFilters {
  search?: string
  genre?: string
  headcount?: number | null
  duration?: number | null
  sort?: PlayerScriptLibrarySort
  page?: number
  pageSize?: number
}

export interface PlayerScriptLibraryPage {
  items: PlayerScriptSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface LargeActivitySummary {
  id: string
  sourceKey: string | null
  title: string
  summary: string
  content: string | null
  coverUrl: string | null
  galleryUrls: string[]
  startAt: string | null
  endAt: string | null
  eventDate: string | null
  location: string | null
  feeNote: string | null
  capacityNote: string | null
  registrationUrl: string | null
  registrationStatus: LargeActivityRegistrationStatus
  registrationDeadline: string | null
  registrationLabel: string | null
  status: LargeActivityStatus
  tags: string[]
  showOnPlayerHome: boolean
  playerHomeOrder: number
  pinInPlayerLibrary: boolean
  playerLibraryOrder: number
  createdAt: string | null
}

export interface PlayerScriptSummary {
  id: string
  title: string
  author: string | null
  coverUrl: string | null
  genreTags: string[]
  playerCountMin: number | null
  playerCountMax: number | null
  durationMinutes: number | null
  budget: string | null
  location: string | null
  createdAt: string | null
  isFeatured: boolean
  isSocialScript: boolean
  showOnPlayerActivity: boolean
  playerActivityOrder: number
  pinInSocialLibrary: boolean
  socialLibraryOrder: number
}

export interface LargeActivitySections {
  upcoming: LargeActivitySummary[]
  latest: LargeActivitySummary[]
}

export interface SocialScriptSections {
  pinned: PlayerScriptSummary[]
  more: PlayerScriptSummary[]
}
