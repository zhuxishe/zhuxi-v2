export interface ScriptDetail {
  id: string
  title: string
  title_ja: string | null
  author: string | null
  description: string | null
  content_html: string | null
  genre_tags: string[] | null
  theme_tags: string[] | null
  difficulty: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration_minutes: number | null
  budget: string | null
  location: string | null
  language: string | null
  warnings: string[] | null
  cover_url: string | null
  pdf_url: string | null
  page_images: string[] | null
  roles: { name: string; gender?: string; description?: string }[] | null
}

export const DIFFICULTY_MAP: Record<string, string> = {
  beginner: '新手',
  intermediate: '进阶',
  advanced: '高阶',
}
