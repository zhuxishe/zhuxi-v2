export interface MiniHomeRouteInput {
  status: string | null
  hasIdentity: boolean
}

export type MiniHomeRouteResult =
  | { action: 'redirect'; to: string }
  | { action: 'render'; view: 'pending' | 'rejected' | 'home' }

export function resolveMiniHomeRoute(
  player: MiniHomeRouteInput | null
): MiniHomeRouteResult {
  if (!player || player.status === null) {
    return { action: 'redirect', to: '/pages/interview/index' }
  }

  if (player.status === 'pending' && !player.hasIdentity) {
    return { action: 'redirect', to: '/pages/interview/index' }
  }

  if (player.status === 'pending') {
    return { action: 'render', view: 'pending' }
  }

  if (player.status === 'rejected') {
    return { action: 'render', view: 'rejected' }
  }

  return { action: 'render', view: 'home' }
}
