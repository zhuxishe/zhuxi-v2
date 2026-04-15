import { MiniOpenRound } from '../../lib/round-state'
import { MiniProfileCompleteness } from '../../lib/profile-completeness'

export interface DashboardData {
  name: string
  status: string
  completeness: MiniProfileCompleteness
  openRound: MiniOpenRound | null
  hasSubmission: boolean
}
