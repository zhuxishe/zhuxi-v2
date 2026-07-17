"use client"

import { useActionState, useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Camera, Check, LoaderCircle, LockKeyhole, Trash2, X } from "lucide-react"
import { updateMyProfileAction, type UpdateProfileActionState } from "@/app/app/profile/edit/actions"
import { ProfileAvatar } from "./ProfileAvatar"

const INITIAL_ACTION_STATE: UpdateProfileActionState = {}
const CROP_SIZE = 512

export interface ProfileEditLabels {
  title: string
  back: string
  save: string
  saving: string
  avatar: string
  changeAvatar: string
  removeAvatar: string
  avatarHint: string
  cropTitle: string
  cropHint: string
  cropFallback: string
  cropZoom: string
  cancel: string
  usePhoto: string
  uploading: string
  uploadFailed: string
  fullName: string
  gender: string
  male: string
  female: string
  other: string
  nickname: string
  optional: string
  nicknamePlaceholder: string
  schoolName: string
  schoolPlaceholder: string
  department: string
  departmentPlaceholder: string
  basicInfo: string
  accountInfo: string
  accountHint: string
  email: string
  memberNumber: string
  emailMissing: string
  memberNumberPending: string
  required: string
  tooLong: string
  nicknameLength: string
  nicknameUnavailable: string
  nicknameReserved: string
  nicknameCommunityRequired: string
  saveFailed: string
  unsavedConfirm: string
}

export interface ProfileEditInitialValues {
  fullName: string
  gender: "male" | "female" | "other"
  nickname: string | null
  schoolName: string | null
  department: string | null
  email: string | null
  memberNumber: string | null
  personalAvatarPath: string | null
  personalAvatarUrl: string | null
}

interface ProfileEditFormProps {
  initial: ProfileEditInitialValues
  labels: ProfileEditLabels
}

interface CropState {
  file: File
  objectUrl: string
  image: HTMLImageElement | null
  fallback: boolean
  zoom: number
  offset: { x: number; y: number }
}

export function ProfileEditForm({ initial, labels }: ProfileEditFormProps) {
  const router = useRouter()
  const fileInputId = useId()
  const [actionState, formAction, pending] = useActionState(updateMyProfileAction, INITIAL_ACTION_STATE)
  const [dirty, setDirty] = useState(false)
  const [avatarPath, setAvatarPath] = useState(initial.personalAvatarPath ?? "")
  const [avatarUrl, setAvatarUrl] = useState(initial.personalAvatarUrl)
  const [crop, setCrop] = useState<CropState | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!actionState.success) return
    setDirty(false)
    router.replace("/app/profile?profile_updated=1")
    router.refresh()
  }, [actionState.success, router])

  function goBack() {
    if (dirty && !window.confirm(labels.unsavedConfirm)) return
    router.push("/app/profile")
  }

  function chooseFile(file: File | undefined) {
    if (!file) return
    setUploadError(null)
    const objectUrl = URL.createObjectURL(file)
    const image = new window.Image()
    image.onload = () => {
      setCrop({ file, objectUrl, image, fallback: false, zoom: 1, offset: { x: 0, y: 0 } })
    }
    image.onerror = () => {
      setCrop({ file, objectUrl, image: null, fallback: true, zoom: 1, offset: { x: 0, y: 0 } })
    }
    image.src = objectUrl
  }

  function closeCrop() {
    if (uploading) return
    if (crop) URL.revokeObjectURL(crop.objectUrl)
    setCrop(null)
  }

  async function uploadCrop() {
    if (!crop) return
    setUploading(true)
    setUploadError(null)
    try {
      const file = crop.image
        ? await canvasFile(document.getElementById("profile-avatar-crop") as HTMLCanvasElement, crop.file.name)
        : crop.file
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/profile/avatar", { method: "POST", body })
      const result = await response.json() as { storagePath?: string; previewUrl?: string; error?: string }
      if (!response.ok || !result.storagePath || !result.previewUrl) {
        throw new Error(result.error || labels.uploadFailed)
      }
      setAvatarPath(result.storagePath)
      setAvatarUrl(`${result.previewUrl}${result.previewUrl.includes("?") ? "&" : "?"}v=${Date.now()}`)
      setDirty(true)
      URL.revokeObjectURL(crop.objectUrl)
      setCrop(null)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : labels.uploadFailed)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="player-profile-edit-screen min-h-screen bg-background pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto grid h-14 max-w-md grid-cols-[4.5rem_1fr_4.5rem] items-center px-2">
          <button type="button" onClick={goBack} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="size-5" aria-hidden="true" />
            <span>{labels.back}</span>
          </button>
          <h1 className="truncate text-center text-[17px] font-semibold">{labels.title}</h1>
          <button
            type="submit"
            form="player-profile-edit-form"
            disabled={!dirty || pending || uploading}
            className="min-h-11 rounded-xl px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-muted-foreground disabled:opacity-60"
          >
            {pending ? labels.saving : labels.save}
          </button>
        </div>
      </header>

      <form
        id="player-profile-edit-form"
        action={formAction}
        onInput={() => setDirty(true)}
        className="mx-auto max-w-md space-y-5 px-4 py-5"
      >
        <input type="hidden" name="personalAvatarPath" value={avatarPath} />

        <section className="rounded-[22px] border border-border/90 bg-card p-5 text-center shadow-soft">
          <h2 className="sr-only">{labels.avatar}</h2>
          <div className="relative mx-auto w-fit">
            <ProfileAvatar src={avatarUrl} alt={initial.nickname || initial.fullName} className="size-24" priority />
            <label
              htmlFor={fileInputId}
              className="absolute -bottom-1 -right-1 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
              aria-label={labels.changeAvatar}
            >
              <Camera className="size-4" aria-hidden="true" />
              <input
                id={fileInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                className="sr-only"
                onChange={(event) => {
                  chooseFile(event.target.files?.[0])
                  event.currentTarget.value = ""
                }}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById(fileInputId)?.click()}
            className="mt-4 min-h-11 rounded-xl px-4 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {labels.changeAvatar}
          </button>
          {avatarPath && (
            <button
              type="button"
              onClick={() => {
                setAvatarPath("")
                setAvatarUrl(null)
                setDirty(true)
              }}
              className="ml-1 min-h-11 rounded-xl px-3 text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              {labels.removeAvatar}
            </button>
          )}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.avatarHint}</p>
          {uploadError && <p role="alert" className="mt-2 text-xs text-destructive">{uploadError}</p>}
        </section>

        <section className="rounded-[22px] border border-border/90 bg-card p-4 shadow-soft">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{labels.basicInfo}</h2>
          <div className="space-y-4">
            <Field label={labels.fullName} required error={fieldError(actionState, "fullName", labels)}>
              <input name="fullName" defaultValue={initial.fullName} required maxLength={100} autoComplete="name" className={INPUT_CLASS} />
            </Field>

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">{labels.gender}<span className="ml-1 text-destructive" aria-hidden="true">*</span></legend>
              <div className="grid grid-cols-3 gap-2">
                {(["male", "female", "other"] as const).map((gender) => (
                  <label key={gender} className="relative cursor-pointer">
                    <input type="radio" name="gender" value={gender} defaultChecked={initial.gender === gender} required className="peer sr-only" />
                    <span className="flex min-h-12 items-center justify-center rounded-xl border border-input bg-background px-2 text-sm font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                      {labels[gender]}
                    </span>
                  </label>
                ))}
              </div>
              {fieldError(actionState, "gender", labels) && <p className="mt-1.5 text-xs text-destructive">{fieldError(actionState, "gender", labels)}</p>}
            </fieldset>

            <Field label={`${labels.nickname} · ${labels.optional}`} error={fieldError(actionState, "nickname", labels)}>
              <input name="nickname" defaultValue={initial.nickname ?? ""} minLength={2} maxLength={20} autoComplete="nickname" placeholder={labels.nicknamePlaceholder} className={INPUT_CLASS} />
            </Field>
            <Field label={`${labels.schoolName} · ${labels.optional}`} error={fieldError(actionState, "schoolName", labels)}>
              <input name="schoolName" defaultValue={initial.schoolName ?? ""} maxLength={120} autoComplete="organization" placeholder={labels.schoolPlaceholder} className={INPUT_CLASS} />
            </Field>
            <Field label={`${labels.department} · ${labels.optional}`} error={fieldError(actionState, "department", labels)}>
              <input name="department" defaultValue={initial.department ?? ""} maxLength={120} placeholder={labels.departmentPlaceholder} className={INPUT_CLASS} />
            </Field>
          </div>
        </section>

        <section className="rounded-[22px] border border-border/90 bg-card p-4 shadow-soft">
          <div className="mb-4 flex items-start gap-2">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">{labels.accountInfo}</h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{labels.accountHint}</p>
            </div>
          </div>
          <ReadOnlyField label={labels.email} value={initial.email || labels.emailMissing} />
          <ReadOnlyField label={labels.memberNumber} value={initial.memberNumber || labels.memberNumberPending} bordered />
        </section>

        {actionState.error && actionState.error !== "validation" && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionState.error === "saveFailed" ? labels.saveFailed : actionState.error}
          </p>
        )}
      </form>

      {crop && (
        <AvatarCropDialog
          crop={crop}
          setCrop={setCrop}
          labels={labels}
          uploading={uploading}
          error={uploadError}
          onClose={closeCrop}
          onConfirm={uploadCrop}
        />
      )}
    </div>
  )
}

const INPUT_CLASS = "min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"

function Field({ label, required = false, error, children }: { label: string; required?: boolean; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-muted-foreground">
        {label}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-destructive">{error}</span>}
    </label>
  )
}

function ReadOnlyField({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div className={`flex min-h-14 items-center justify-between gap-4 ${bordered ? "border-t border-border/80" : ""}`}>
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm text-foreground">{value}</span>
    </div>
  )
}

function fieldError(state: UpdateProfileActionState, field: keyof NonNullable<UpdateProfileActionState["fieldErrors"]>, labels: ProfileEditLabels) {
  const error = state.fieldErrors?.[field]
  if (error === "required") return labels.required
  if (error === "tooLong") return labels.tooLong
  if (error === "nicknameLength") return labels.nicknameLength
  if (error === "nicknameUnavailable") return labels.nicknameUnavailable
  if (error === "nicknameReserved") return labels.nicknameReserved
  if (error === "nicknameCommunityRequired") return labels.nicknameCommunityRequired
  return error ?? null
}

function AvatarCropDialog({
  crop,
  setCrop,
  labels,
  uploading,
  error,
  onClose,
  onConfirm,
}: {
  crop: CropState
  setCrop: React.Dispatch<React.SetStateAction<CropState | null>>
  labels: ProfileEditLabels
  uploading: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ point: { x: number; y: number }; offset: { x: number; y: number } } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !crop.image) return
    drawCrop(canvas, crop.image, crop.zoom, crop.offset)
  }, [crop])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !uploading) onClose()
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", keydown)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", keydown)
    }
  }, [onClose, uploading])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#111] text-white" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
      <header className="flex min-h-14 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} disabled={uploading} aria-label={labels.cancel} className="grid size-11 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">
          <X className="size-6" aria-hidden="true" />
        </button>
        <h2 id="avatar-crop-title" className="text-base font-semibold">{labels.cropTitle}</h2>
        <span className="size-11" aria-hidden="true" />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-6">
        {crop.image ? (
          <canvas
            id="profile-avatar-crop"
            ref={canvasRef}
            width={CROP_SIZE}
            height={CROP_SIZE}
            className="aspect-square w-full max-w-[min(78vw,22rem)] touch-none rounded-full bg-black ring-2 ring-white/80"
            aria-label={labels.cropTitle}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { point: { x: event.clientX, y: event.clientY }, offset: crop.offset }
            }}
            onPointerMove={(event) => {
              if (!drag.current || !crop.image) return
              const scale = CROP_SIZE / event.currentTarget.getBoundingClientRect().width
              const next = {
                x: drag.current.offset.x + (event.clientX - drag.current.point.x) * scale,
                y: drag.current.offset.y + (event.clientY - drag.current.point.y) * scale,
              }
              setCrop((current) => current?.image ? { ...current, offset: clampOffset(current.image, current.zoom, next) } : current)
            }}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
          />
        ) : (
          <div className="flex aspect-square w-full max-w-[min(78vw,22rem)] items-center justify-center rounded-full bg-white/10 p-8 text-center text-sm leading-6 text-white/75 ring-2 ring-white/50">
            {labels.cropFallback}
          </div>
        )}

        <p className="max-w-sm text-center text-sm leading-6 text-white/75">{crop.image ? labels.cropHint : labels.cropFallback}</p>
        {crop.image && (
          <label className="flex w-full max-w-sm items-center gap-3 text-sm text-white/80">
            <span className="shrink-0">{labels.cropZoom}</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={crop.zoom}
              onChange={(event) => {
                const zoom = Number(event.target.value)
                setCrop((current) => current?.image ? { ...current, zoom, offset: clampOffset(current.image, zoom, current.offset) } : current)
              }}
              className="min-h-11 w-full accent-white"
            />
          </label>
        )}
        {error && <p role="alert" className="max-w-sm text-center text-sm text-red-300">{error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-white/15 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} disabled={uploading} className="min-h-12 rounded-xl border border-white/30 px-4 text-sm font-semibold disabled:opacity-50">{labels.cancel}</button>
        <button type="button" onClick={onConfirm} disabled={uploading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#1d3123] disabled:opacity-60">
          {uploading ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          {uploading ? labels.uploading : labels.usePhoto}
        </button>
      </div>
    </div>
  )
}

function baseScale(image: HTMLImageElement, zoom: number) {
  return Math.max(CROP_SIZE / image.naturalWidth, CROP_SIZE / image.naturalHeight) * zoom
}

function clampOffset(image: HTMLImageElement, zoom: number, offset: { x: number; y: number }) {
  const scale = baseScale(image, zoom)
  const maxX = Math.max(0, (image.naturalWidth * scale - CROP_SIZE) / 2)
  const maxY = Math.max(0, (image.naturalHeight * scale - CROP_SIZE) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  }
}

function drawCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, zoom: number, offset: { x: number; y: number }) {
  const context = canvas.getContext("2d")
  if (!context) return
  const scale = baseScale(image, zoom)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.clearRect(0, 0, CROP_SIZE, CROP_SIZE)
  context.drawImage(image, (CROP_SIZE - width) / 2 + offset.x, (CROP_SIZE - height) / 2 + offset.y, width, height)
}

function canvasFile(canvas: HTMLCanvasElement | null, originalName: string) {
  return new Promise<File>((resolve, reject) => {
    if (!canvas) {
      reject(new Error("Avatar crop is unavailable"))
      return
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Avatar crop is unavailable"))
        return
      }
      const baseName = originalName.replace(/\.[^.]+$/, "") || "avatar"
      resolve(new File([blob], `${baseName}-crop.jpg`, { type: "image/jpeg" }))
    }, "image/jpeg", 0.92)
  })
}
