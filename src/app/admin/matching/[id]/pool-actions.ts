"use server"

import { performMatchingAdjustment } from "@/lib/matching/adjustment-service"

/** Scope remains this session's cancelled, currently unoccupied members only. */
export async function runPoolRematch(sessionId: string, rawReason: string, operationId?: string, expectedRevision?: string) {
  return performMatchingAdjustment({ sessionId, kind: "pool", rawReason, operationId, expectedRevision })
}
