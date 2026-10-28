"use server"

import { fetchRoundAudience, saveRoundAudienceConfiguration } from "@/lib/matching/round-audience-service"
import type { RoundAudienceSaveInput } from "@/lib/matching/round-audience-types"

export async function loadRoundAudience(roundId: string) { return fetchRoundAudience(roundId) }
export async function saveRoundAudience(input: RoundAudienceSaveInput) { return saveRoundAudienceConfiguration(input) }
