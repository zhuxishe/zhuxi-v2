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
