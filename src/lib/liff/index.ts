/**
 * LINE LIFF SDK wrapper (auth only, no sharing)
 */

import liff from "@line/liff"

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID!

export interface LiffProfile {
  userId: string
  displayName: string
  pictureUrl?: string
}

let initialized = false
let initPromise: Promise<void> | null = null

export async function initLiff(): Promise<void> {
  if (initialized) return
  if (initPromise) return initPromise
  initPromise = liff.init({ liffId: LIFF_ID }).then(() => { initialized = true }).catch((err) => { initPromise = null; throw err })
  return initPromise
}

export function isLineLoggedIn(): boolean {
  return initialized && liff.isLoggedIn()
}

export function lineLogin(redirectUri?: string): void {
  if (initialized && !liff.isLoggedIn()) liff.login({ redirectUri })
}

export async function getLineProfile(): Promise<LiffProfile | null> {
  if (!initialized || !liff.isLoggedIn()) return null
  try {
    const p = await liff.getProfile()
    return { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl }
  } catch { return null }
}

export function getLineIdToken(): string | null {
  if (!initialized || !liff.isLoggedIn()) return null
  return liff.getIDToken()
}
