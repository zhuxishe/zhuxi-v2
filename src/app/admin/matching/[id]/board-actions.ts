"use server"

import { fetchMatchingBoard, inspectMatchingBoardGroup, inspectMatchingBoardGroupMove, inspectMatchingBoardGroupDissolve, inspectMatchingBoardGroupTime, inspectMatchingBoardMultiMove, inspectMatchingBoardPair, inspectMatchingBoardSmallGroupCandidates, recommendMatchingBoardSmallGroups, rematchMatchingBoard, saveMatchingBoard, setMatchingBoardMemberLock } from "@/lib/matching/board-service"
import type { BoardMemberLockRequest, BoardRequest } from "@/lib/matching/board-types"
import { fetchSavedMatchingReview } from "@/lib/matching/session-review-service"

export async function loadMatchingBoard(sessionId: string) { return fetchMatchingBoard(sessionId) }
export async function loadSavedMatchingReview(sessionId: string) { return fetchSavedMatchingReview(sessionId) }
export async function inspectBoardPair(input: BoardRequest & { memberIds: [string, string] }) { return inspectMatchingBoardPair(input) }
export async function inspectBoardMultiMove(input: BoardRequest & { memberId: string }) { return inspectMatchingBoardMultiMove(input) }
export async function inspectBoardGroup(input: BoardRequest & { memberIds: string[]; slot: string; groupKind?: "small"; manuallyAdjusted?: boolean }) { return inspectMatchingBoardGroup(input) }
export async function recommendBoardSmallGroups(input: BoardRequest) { return recommendMatchingBoardSmallGroups(input) }
export async function inspectBoardSmallGroupCandidates(input: BoardRequest & { memberIds: string[]; slot: string }) { return inspectMatchingBoardSmallGroupCandidates(input) }
export async function inspectBoardGroupMove(input: BoardRequest & { memberId: string; groupKey: string }) { return inspectMatchingBoardGroupMove(input) }
export async function inspectBoardGroupDissolve(input: BoardRequest & { groupKey: string }) { return inspectMatchingBoardGroupDissolve(input) }
export async function inspectBoardGroupTime(input: BoardRequest & { groupKey: string; slot: string }) { return inspectMatchingBoardGroupTime(input) }
export async function rematchBoard(input: BoardRequest) { return rematchMatchingBoard(input) }
export async function saveBoard(input: BoardRequest & { operationId: string; reason: string }) { return saveMatchingBoard(input) }

export async function setBoardMemberLock(input: BoardMemberLockRequest) { return setMatchingBoardMemberLock(input) }
