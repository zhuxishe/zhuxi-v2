import { AlertTriangle, CheckCircle } from "lucide-react"

export interface CompatResult {
  compatible: boolean
  warnings: string[]
  score: number
  breakdown: { factor: string; label: string; weight: number; rawScore: number; weightedScore: number; detail: string }[]
  bestSlot: string | null
}

/** 成员选择下拉 */
export function MemberSelect({ label, value, onChange, members, exclude }: {
  label: string
  value: string
  onChange: (v: string) => void
  members: { id: string; name: string }[]
  exclude: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">请选择...</option>
        {members
          .filter((m) => m.id !== exclude)
          .map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
      </select>
    </div>
  )
}

/** 兼容性结果展示 */
export function CompatDisplay({ compat, nameA, nameB }: {
  compat: CompatResult
  nameA?: string
  nameB?: string
}) {
  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <div className="flex items-center gap-1.5">
        {compat.compatible ? (
          <CheckCircle className="size-4 text-green-600" />
        ) : (
          <AlertTriangle className="size-4 text-red-600" />
        )}
        <span className="font-medium">
          {nameA} & {nameB} — {compat.score.toFixed(1)} 分
        </span>
      </div>

      {compat.warnings.length > 0 && (
        <div className="space-y-1">
          {compat.warnings.map((w, i) => (
            <p key={i} className="text-red-600 text-xs">{w}</p>
          ))}
        </div>
      )}

      {compat.breakdown.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          {compat.breakdown.map((b) => (
            <span key={b.label}>{b.label}: {b.weightedScore.toFixed(1)}</span>
          ))}
        </div>
      )}
    </div>
  )
}
