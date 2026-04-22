export const HOME_SKIP_INTRO_HREF = "/#top"

const INTRO_SEEN_KEY = "zhuxi:intro-seen"

export function hasSeenLandingIntro() {
  if (typeof window === "undefined") return false

  try {
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) === "1"
  } catch {
    return false
  }
}

export function rememberLandingIntroSeen() {
  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1")
  } catch {
    // Privacy modes and embedded browsers can block sessionStorage.
  }
}

export function shouldSkipLandingIntro() {
  if (typeof window === "undefined") return false

  return window.location.hash.length > 0 || hasSeenLandingIntro()
}
