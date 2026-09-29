import type { SurveyWindow } from "@/lib/matching/survey-window"
import type { RoundPurpose } from "@/types/matching-round"

export interface PlayerHomeAction {
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
}

export interface PlayerHomeActivityItem {
  id: string
  title: string
  coverUrl: string | null
  startAt: string | null
  eventDate: string | null
  location: string | null
}

export interface PlayerHomeAnnouncementItem {
  id: string
  title: string
}

export interface PlayerHomeRoundItem extends SurveyWindow {
  id: string
  title: string
  purpose: RoundPurpose
  submitted: boolean
  eventStart: string
  location: string
}
