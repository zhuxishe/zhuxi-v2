"use server"

import { revalidatePath } from "next/cache"
import { requirePlayer } from "@/lib/auth/player"
import { ProfileDataError, updateMyProfile } from "@/lib/profile/queries"

export interface UpdateProfileActionState {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<"fullName" | "gender" | "nickname" | "schoolName" | "department", string>>
}

function normalizeRequired(formData: FormData, key: string) {
  const raw = formData.get(key)
  return typeof raw === "string" ? raw.normalize("NFKC").trim() : ""
}

function normalizeOptional(formData: FormData, key: string) {
  const value = normalizeRequired(formData, key)
  return value || null
}

function tooLong(value: string | null, limit: number) {
  return value != null && [...value].length > limit
}

export async function updateMyProfileAction(
  _previous: UpdateProfileActionState,
  formData: FormData,
): Promise<UpdateProfileActionState> {
  await requirePlayer()

  const fullName = normalizeRequired(formData, "fullName")
  const gender = normalizeRequired(formData, "gender")
  const nickname = normalizeOptional(formData, "nickname")
  const schoolName = normalizeOptional(formData, "schoolName")
  const department = normalizeOptional(formData, "department")
  const personalAvatarPath = normalizeOptional(formData, "personalAvatarPath")
  const fieldErrors: NonNullable<UpdateProfileActionState["fieldErrors"]> = {}

  if (!fullName) fieldErrors.fullName = "required"
  else if (tooLong(fullName, 100)) fieldErrors.fullName = "tooLong"
  if (!new Set(["male", "female", "other"]).has(gender)) fieldErrors.gender = "required"
  if (nickname && ([...nickname].length < 2 || [...nickname].length > 20)) fieldErrors.nickname = "nicknameLength"
  if (tooLong(schoolName, 120)) fieldErrors.schoolName = "tooLong"
  if (tooLong(department, 120)) fieldErrors.department = "tooLong"

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "validation", fieldErrors }
  }

  try {
    await updateMyProfile({
      fullName,
      gender: gender as "male" | "female" | "other",
      nickname,
      schoolName,
      department,
      personalAvatarPath,
    })
  } catch (error) {
    console.error("[updateMyProfileAction]", error)
    const code = error instanceof ProfileDataError ? error.code : "PROFILE_REQUEST_FAILED"
    const rawMessage = error instanceof ProfileDataError
      ? `${error.message} ${error.causeError?.message ?? ""}`
      : ""
    if (code === "PROFILE_NICKNAME_INVALID" || rawMessage.includes("Nickname must contain 2 to 20 characters")) {
      return { error: "validation", fieldErrors: { nickname: "nicknameLength" } }
    }
    if (code === "PROFILE_NICKNAME_REQUIRED_FOR_COMMUNITY" || rawMessage.includes("community profile requires a nickname")) {
      return { error: "validation", fieldErrors: { nickname: "nicknameCommunityRequired" } }
    }
    if (code === "PROFILE_NICKNAME_RESERVED" || rawMessage.includes("non-reserved")) {
      return { error: "validation", fieldErrors: { nickname: "nicknameReserved" } }
    }
    if (code === "PROFILE_NICKNAME_TAKEN" || rawMessage.includes("nickname is already in use")) {
      return { error: "validation", fieldErrors: { nickname: "nicknameUnavailable" } }
    }
    if (code === "PROFILE_FULL_NAME_INVALID") return { error: "validation", fieldErrors: { fullName: "required" } }
    if (code === "PROFILE_GENDER_INVALID") return { error: "validation", fieldErrors: { gender: "required" } }
    if (code === "PROFILE_SCHOOL_NAME_INVALID") return { error: "validation", fieldErrors: { schoolName: "tooLong" } }
    if (code === "PROFILE_DEPARTMENT_INVALID") return { error: "validation", fieldErrors: { department: "tooLong" } }
    return { error: "saveFailed" }
  }

  revalidatePath("/app/profile")
  revalidatePath("/app/profile/edit")
  revalidatePath("/app/profile/community")
  revalidatePath("/admin/members")
  return { success: true }
}
