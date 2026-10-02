export interface CommentLikeSnapshot {
  liked: boolean
  count: number
  version: number
}

export interface CommentLikeState extends CommentLikeSnapshot {
  source: CommentLikeSnapshot
  rollback: CommentLikeSnapshot | null
  pending: boolean
  error: string
}

type CommentLikeEvent =
  | { type: "sync"; snapshot: CommentLikeSnapshot }
  | { type: "start" }
  | { type: "success"; snapshot: CommentLikeSnapshot }
  | { type: "failure"; error: string }

export function createCommentLikeState(snapshot: CommentLikeSnapshot): CommentLikeState {
  return { ...snapshot, source: snapshot, rollback: null, pending: false, error: "" }
}

export function commentLikeReducer(state: CommentLikeState, event: CommentLikeEvent): CommentLikeState {
  switch (event.type) {
    case "sync":
      if (event.snapshot.liked === state.source.liked && event.snapshot.count === state.source.count
        && event.snapshot.version === state.source.version) return state
      // Consume out-of-order props without regressing the latest confirmed
      // database version. Equal versions describe the same immutable snapshot.
      if (event.snapshot.version <= state.version) return { ...state, source: event.snapshot }
      // A refresh during a write cannot erase its optimistic feedback. Retain the
      // latest verified snapshot for rollback if the write cannot be confirmed.
      return state.pending
        ? { ...state, version: event.snapshot.version, source: event.snapshot, rollback: event.snapshot }
        : { ...state, ...event.snapshot, source: event.snapshot }
    case "start":
      if (state.pending) return state
      return {
        ...state,
        rollback: { liked: state.liked, count: state.count, version: state.version },
        liked: !state.liked,
        count: Math.max(0, state.count + (state.liked ? -1 : 1)),
        pending: true,
        error: "",
      }
    case "success": {
      // A newer background snapshot may arrive before the write's response.
      const snapshot = event.snapshot.version > state.version ? event.snapshot : state.rollback ?? state
      return { ...state, ...snapshot, pending: false, rollback: null, error: "" }
    }
    case "failure":
      return { ...state, ...(state.rollback ?? state.source), pending: false, rollback: null, error: event.error }
  }
}
