import { AlertTriangle, CheckCircle, XCircle, X } from "lucide-react"
import { ScoreBreakdownChart } from "./ScoreBreakdownChart"
import type { ConstraintItem } from "@/app/admin/matching/[id]/manual-actions"

export interface CompatResult {
  compatible: boolean
  warnings: string[]
  constraints: ConstraintItem[]
  score: number
  breakdown: { factor: string; label: string; weight: number; rawScore: number; weightedScore: number; detail: string }[]
  bestSlot: string | null
  revisionToken?: string
}

export interface GroupCompatResult {
  score?: number
  breakdown?: CompatResult["breakdown"]
  scoreBreakdown?: unknown
  compatible: boolean
  warnings: string[]
  constraints: ConstraintItem[]
  bestSlot: string | null
  revisionToken?: string
}

/** 成员选择下拉 */
export function MemberSelect({ label, value, onChange, members, exclude, disabled = false }: {
  label: string
  value: string
  onChange: (v: string) => void
  members: { id: string; name: string }[]
  exclude?: string | string[]
  disabled?: boolean
}) {
  const excludeSet = new Set(Array.isArray(exclude) ? exclude : exclude ? [exclude] : [])
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        aria-label={label}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">请选择...</option>
        {members
          .filter((m) => !excludeSet.has(m.id))
          .map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
      </select>
    </div>
  )
}

/** 已选成员 chips */
export function MemberChips({ ids, members, onRemove, disabled = false }: {
  ids: string[]
  members: { id: string; name: string }[]
  onRemove: (id: string) => void
  disabled?: boolean
}) {
  const nameMap = new Map(members.map((m) => [m.id, m.name]))
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
          {nameMap.get(id) ?? id}
          <button type="button" disabled={disabled} aria-label={`移除${nameMap.get(id) ?? id}`} onClick={() => onRemove(id)} className="hover:bg-primary/20 rounded-full p-0.5">
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

/** 约束条目展示（双人 + 多人共用） */
function ConstraintList({ constraints }: { constraints: ConstraintItem[] }) {
  const icons = {
    pass: <CheckCircle className="size-3.5 text-green-600 shrink-0" />,
    fail: <XCircle className="size-3.5 text-red-600 shrink-0" />,
    warn: <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />,
  }
  return (
    <div className="space-y-1.5 text-xs">
      {constraints.map((c) => (
        <div key={c.label}>
          <div className="flex items-center gap-1.5">
            {icons[c.status]}
            <span className={`font-medium ${c.status === "fail" ? "text-red-700" : c.status === "warn" ? "text-amber-700" : ""}`}>
              {c.label}
            </span>
          </div>
          {c.details.map((d, i) => (
            <p key={i} className="ml-5 text-muted-foreground">{d}</p>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 双人兼容性结果展示（硬约束 + 评分） */
export function CompatDisplay({ compat }: { compat: CompatResult }) {
  return (
    <div className="rounded-md border p-3 space-y-3 text-sm">
      {/* 硬约束 */}
      <ConstraintList constraints={compat.constraints} />

      {/* 评分 */}
      <div className="border-t pt-2">
        <div className="flex items-center gap-1.5">
          {compat.compatible ? (
            <CheckCircle className="size-4 text-green-600" />
          ) : (
            <AlertTriangle className="size-4 text-red-600" />
          )}
          <span className="font-medium">{compat.compatible ? `${compat.score.toFixed(1)} 分` : "未通过约束，不能保存评分"}</span>
        </div>

        {compat.warnings.length > 0 && (
          <div className="space-y-1 mt-1">
            {compat.warnings.map((w, i) => (
              <p key={i} className="text-red-600 text-xs">{w}</p>
            ))}
          </div>
        )}

        {compat.breakdown.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
            {compat.breakdown.map((b) => (
              <span key={b.label}>{b.label}: {b.weightedScore.toFixed(1)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 多人池兼容性结果和当前评分，明细仍由服务端按管理员权限控制。 */
export function GroupCompatDisplay({ compat }: { compat: GroupCompatResult }) {
  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <ConstraintList constraints={compat.constraints} />
      {compat.warnings.length > 0 && (
        <div className="space-y-1 mt-1">
          {compat.warnings.map((w, i) => (
            <p key={i} className="text-red-600 text-xs">{w}</p>
          ))}
        </div>
      )}
      {compat.compatible && typeof compat.score === "number" && <p className="font-medium">整池平均分：{compat.score.toFixed(1)} 分</p>}
      {compat.compatible && compat.scoreBreakdown != null && <ScoreBreakdownChart breakdown={compat.scoreBreakdown} />}
      {compat.compatible && compat.scoreBreakdown == null && compat.breakdown && compat.breakdown.length > 0 && <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">{compat.breakdown.map((item) => <span key={item.factor}>{item.label}: {item.weightedScore.toFixed(1)}</span>)}</div>}
      {compat.bestSlot && (
        <p className="text-xs text-muted-foreground">最佳时段: {compat.bestSlot.replace("_", " ")}</p>
      )}
    </div>
  )
}
