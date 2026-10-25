"use server"

import { fetchMatchingBoard, inspectMatchingBoardMultiMove, inspectMatchingBoardPair, rematchMatchingBoard, saveMatchingBoard, setMatchingBoardMemberLock } from "@/lib/matching/board-service"
import type { BoardMemberLockRequest, BoardRequest } from "@/lib/matching/board-types"

export async function loadMatchingBoard(sessionId: string) { return fetchMatchingBoard(sessionId) }
export async function inspectBoardPair(input: BoardRequest & { memberIds: [string, string] }) { return inspectMatchingBoardPair(input) }
export async function inspectBoardMultiMove(input: BoardRequest & { memberId: string }) { return inspectMatchingBoardMultiMove(input) }
export async function rematchBoard(input: BoardRequest) { return rematchMatchingBoard(input) }
export async function saveBoard(input: BoardRequest & { operationId: string; reason: string }) { return saveMatchingBoard(input) }

export async function setBoardMemberLock(input: BoardMemberLockRequest) { return setMatchingBoardMemberLock(input) }
