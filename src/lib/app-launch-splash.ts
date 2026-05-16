export const APP_SPLASH_SEEN_KEY = "zhuxi:app-launch-splash-seen"
export const APP_SPLASH_SKIP_ONCE_KEY = "zhuxi:app-launch-splash-skip-once"
export const APP_SPLASH_SKIP_COOKIE = "zhuxi_app_splash_skip_once"

export function skipAppLaunchSplashOnce() {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(APP_SPLASH_SKIP_ONCE_KEY, "1")
  } catch {
    // sessionStorage can be blocked in strict privacy modes.
  }
}
