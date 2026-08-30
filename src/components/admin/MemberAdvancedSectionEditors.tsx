"use client"

import { type FormEvent, useState, useTransition } from "react"
import { Save, ShieldAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  updateAdvancedMemberSectionAction,
  updateLegacyMemberAction,
} from "@/app/admin/members/[id]/advanced/actions"
import { Button } from "@/components/ui/button"
import type { MemberCenterRecord } from "@/types"

const INPUT_CLASS = "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
const ACCOUNT_FIELDS = [
  ["email", "成员邮箱", true],
  ["user_id", "Auth user_id", true],
  ["line_user_id", "LINE user ID", true],
  ["wechat_openid", "WeChat OpenID", true],
  ["membership_type", "会员类型", false],
  ["record_source", "记录来源", false],
] as const
const ROLE_OPTIONS = [
  ["volunteer", "志愿者 / Volunteer"],
  ["community_moderator", "社区管理员 / Community moderator"],
  ["operations", "运营 / Operations"],
] as const

function toTokyoDateTimeLocal(value: unknown) {
  if (typeof value !== "string" || !value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19)
}

function ResultMessage({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) return null
  return <p role={error ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-sm ${error ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-800"}`}>{error ?? message}</p>
}

function recordString(record: MemberCenterRecord, key: string) {
  return typeof record[key] === "string" ? String(record[key]) : ""
}

function recordStringList(record: MemberCenterRecord, key: string) {
  return Array.isArray(record[key])
    ? (record[key] as unknown[]).filter((value): value is string => typeof value === "string").join(", ")
    : ""
}

function parseTagList(value: string) {
  return Array.from(new Set(
    value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
  ))
}

function ReasonInput({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">修改原因（必填）</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} rows={2} placeholder="说明修改依据与预期影响" className={`${INPUT_CLASS} py-2`} disabled={disabled} />
    </label>
  )
}

export function MemberAccountAdvancedEditor({ memberId, account }: { memberId: string; account: MemberCenterRecord }) {
  const router = useRouter()
  const [field, setField] = useState<(typeof ACCOUNT_FIELDS)[number][0]>("email")
  const [value, setValue] = useState(() => typeof account.email === "string" ? account.email : "")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const definition = ACCOUNT_FIELDS.find(([key]) => key === field) ?? ACCOUNT_FIELDS[0]

  function changeField(nextField: (typeof ACCOUNT_FIELDS)[number][0]) {
    setField(nextField)
    setValue(typeof account[nextField] === "string" ? String(account[nextField]) : "")
    setError(null)
    setMessage(null)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = value.trim()
    if (!definition[2] && !normalized) {
      setError(`${definition[1]}不能为空`)
      return
    }
    if (field === "record_source" && !["app", "line", "legacy", "import", "admin"].includes(normalized)) {
      setError("记录来源必须为 app、line、legacy、import 或 admin")
      return
    }
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateAdvancedMemberSectionAction({
        memberId,
        section: "account",
        payload: { [field]: normalized || null },
        reason,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setReason("")
      setMessage(`${definition[1]}已更新`)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-rose-700" aria-hidden="true" /><h3 className="font-semibold text-rose-950">高级账号字段（super_admin）</h3></div>
      <p className="mt-1 text-xs leading-5 text-rose-900">一次只修改一个字段。清空可空字段会解除对应绑定；account_status 请使用生命周期面板，会员编号请使用上方专用编辑器。</p>
      <form className="mt-4 grid gap-3 lg:grid-cols-2" onSubmit={save}>
        <label>
          <span className="mb-1 block text-xs font-medium text-rose-900">字段</span>
          <select value={field} onChange={(event) => changeField(event.target.value as typeof field)} className={INPUT_CLASS} disabled={pending}>
            {ACCOUNT_FIELDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-rose-900">新值{definition[2] ? "（可清空）" : ""}</span>
          <input value={value} onChange={(event) => setValue(event.target.value)} className={INPUT_CLASS} disabled={pending} placeholder={definition[1]} />
        </label>
        <div className="lg:col-span-2"><ReasonInput value={reason} onChange={setReason} disabled={pending} /></div>
        <div className="lg:col-span-2 flex justify-end"><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 4}><Save className="size-4" />{pending ? "保存中" : "保存高级账号字段"}</Button></div>
      </form>
      <ResultMessage error={error} message={message} />
    </section>
  )
}

export function MemberQuizAdvancedEditor({ memberId, quiz }: { memberId: string; quiz: MemberCenterRecord | null }) {
  const router = useRouter()
  const [answers, setAnswers] = useState(() => JSON.stringify(quiz?.answers ?? [], null, 2))
  const [scores, setScores] = useState(() => ({
    score_e: String(quiz?.score_e ?? 0), score_a: String(quiz?.score_a ?? 0), score_o: String(quiz?.score_o ?? 0),
    score_c: String(quiz?.score_c ?? 0), score_n: String(quiz?.score_n ?? 0),
  }))
  const [personalityType, setPersonalityType] = useState(() => typeof quiz?.personality_type === "string" ? quiz.personality_type : "")
  const [completedAt, setCompletedAt] = useState(() => toTokyoDateTimeLocal(quiz?.completed_at))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    let parsedAnswers: unknown
    try { parsedAnswers = JSON.parse(answers) } catch { setError("answers 必须是有效 JSON"); return }
    if (!Array.isArray(parsedAnswers)) { setError("answers 必须是 JSON 数组"); return }
    const numericScores = Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value)]))
    if (Object.values(numericScores).some((value) => !Number.isInteger(value) || value < 0 || value > 100)) {
      setError("五项分数必须是 0–100 的整数")
      return
    }
    const parsedCompletedAt = completedAt ? new Date(`${completedAt}+09:00`) : null
    if (parsedCompletedAt && Number.isNaN(parsedCompletedAt.getTime())) {
      setError("completed_at 必须是有效的日本时间")
      return
    }
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateAdvancedMemberSectionAction({
        memberId,
        section: "quiz",
        payload: {
          answers: parsedAnswers,
          ...numericScores,
          personality_type: personalityType.trim() || null,
          ...(parsedCompletedAt ? { completed_at: parsedCompletedAt.toISOString() } : {}),
        },
        reason,
      })
      if (!result.success) { setError(result.error); return }
      setReason("")
      setMessage("人格测试原始记录已更新")
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 xl:col-span-2">
      <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-rose-700" aria-hidden="true" /><h3 className="font-semibold text-rose-950">人格测试原始记录（super_admin）</h3></div>
      <p className="mt-1 text-xs text-rose-900">这是高风险人工纠错入口；不会重新运行测试计分逻辑。</p>
      <form className="mt-4 space-y-3" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-5">
          {(Object.keys(scores) as Array<keyof typeof scores>).map((key) => (
            <label key={key}><span className="mb-1 block font-mono text-xs text-rose-900">{key}</span><input type="number" min={0} max={100} step={1} value={scores[key]} onChange={(event) => setScores((current) => ({ ...current, [key]: event.target.value }))} className={INPUT_CLASS} disabled={pending} /></label>
          ))}
        </div>
        <label className="block"><span className="mb-1 block text-xs text-rose-900">personality_type</span><input value={personalityType} onChange={(event) => setPersonalityType(event.target.value)} maxLength={100} className={INPUT_CLASS} disabled={pending} /></label>
        <label className="block"><span className="mb-1 block text-xs text-rose-900">completed_at（日本时间）</span><input type="datetime-local" step={1} value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} className={INPUT_CLASS} disabled={pending} /></label>
        <label className="block"><span className="mb-1 block text-xs text-rose-900">answers JSON 数组</span><textarea value={answers} onChange={(event) => setAnswers(event.target.value)} rows={8} className={`${INPUT_CLASS} min-h-40 py-2 font-mono text-xs`} disabled={pending} /></label>
        <ReasonInput value={reason} onChange={setReason} disabled={pending} />
        <div className="flex justify-end"><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 4}><Save className="size-4" />{pending ? "保存中" : "保存原始测试记录"}</Button></div>
      </form>
      <ResultMessage error={error} message={message} />
    </section>
  )
}

export function MemberRolesAdvancedEditor({ memberId, roles }: { memberId: string; roles: MemberCenterRecord[] }) {
  const router = useRouter()
  const activeRoles = roles.filter((role) => role.revoked_at == null && typeof role.role_key === "string").map((role) => String(role.role_key))
  const [selected, setSelected] = useState<string[]>(activeRoles)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateAdvancedMemberSectionAction({ memberId, section: "roles", payload: { roles: selected }, reason })
      if (!result.success) { setError(result.error); return }
      setReason("")
      setMessage("成员角色已更新")
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-rose-700" aria-hidden="true" /><h3 className="font-semibold text-rose-950">角色分配（super_admin）</h3></div>
      <form className="mt-4 space-y-3" onSubmit={save}>
        <div className="space-y-2">
          {ROLE_OPTIONS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={selected.includes(key)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, key] : current.filter((role) => role !== key))} disabled={pending} />{label}
            </label>
          ))}
        </div>
        <ReasonInput value={reason} onChange={setReason} disabled={pending} />
        <div className="flex justify-end"><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 4}><Save className="size-4" />{pending ? "保存中" : "保存角色"}</Button></div>
      </form>
      <ResultMessage error={error} message={message} />
    </section>
  )
}

export function MemberWorkflowAdvancedEditor({
  memberId,
  profileStage,
  onboardingStep,
}: {
  memberId: string
  profileStage: string | null
  onboardingStep: number | null
}) {
  const router = useRouter()
  const [stage, setStage] = useState(profileStage ?? "not_started")
  const [step, setStep] = useState(String(onboardingStep ?? 0))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedStep = Number(step)
    if (!Number.isInteger(parsedStep) || parsedStep < 0 || parsedStep > 4) {
      setError("onboarding_step 必须是 0–4 的整数")
      return
    }
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateAdvancedMemberSectionAction({
        memberId,
        section: "workflow",
        payload: { profile_stage: stage, onboarding_step: parsedStep },
        reason,
      })
      if (!result.success) { setError(result.error); return }
      setReason("")
      setMessage("资料流程状态已更新")
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-rose-700" aria-hidden="true" /><h3 className="font-semibold text-rose-950">资料流程覆盖（super_admin）</h3></div>
      <p className="mt-1 text-xs leading-5 text-rose-900">用于修复异常流程状态；不会改写创建、提交或更新时间等技术时间戳。</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={save}>
        <label>
          <span className="mb-1 block text-xs font-medium text-rose-900">profile_stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value)} className={INPUT_CLASS} disabled={pending}>
            <option value="not_started">not_started</option>
            <option value="in_progress">in_progress</option>
            <option value="submitted">submitted</option>
            <option value="complete">complete</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-rose-900">onboarding_step</span>
          <input type="number" min={0} max={4} step={1} value={step} onChange={(event) => setStep(event.target.value)} className={INPUT_CLASS} disabled={pending} />
        </label>
        <div className="sm:col-span-2"><ReasonInput value={reason} onChange={setReason} disabled={pending} /></div>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 4}><Save className="size-4" />{pending ? "保存中" : "覆盖流程状态"}</Button></div>
      </form>
      <ResultMessage error={error} message={message} />
    </section>
  )
}

export function MemberLegacyAdvancedEditor({
  memberId,
  legacyRecord,
  recordNumber,
}: {
  memberId: string
  legacyRecord: MemberCenterRecord
  recordNumber: number
}) {
  const router = useRouter()
  const legacyId = recordString(legacyRecord, "id")
  const [form, setForm] = useState(() => ({
    memberNo: recordString(legacyRecord, "member_no"),
    fullName: recordString(legacyRecord, "full_name"),
    gender: recordString(legacyRecord, "gender"),
    school: recordString(legacyRecord, "school"),
    department: recordString(legacyRecord, "department"),
    interestTags: recordStringList(legacyRecord, "interest_tags"),
    socialTags: recordStringList(legacyRecord, "social_tags"),
    gameMode: recordString(legacyRecord, "game_mode"),
    compatibilityScore: legacyRecord.compatibility_score == null
      ? ""
      : String(legacyRecord.compatibility_score),
    sessionCount: legacyRecord.session_count == null
      ? ""
      : String(legacyRecord.session_count),
    matchHistory: JSON.stringify(legacyRecord.match_history ?? [], null, 2),
    claimStatus: recordString(legacyRecord, "claim_status") || "unclaimed",
  }))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function setField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!legacyId) {
      setError("历史记录 ID 缺失，无法安全修改")
      return
    }
    if (!form.memberNo.trim() || !form.fullName.trim()) {
      setError("历史会员编号和姓名不能为空")
      return
    }

    const compatibilityScore = form.compatibilityScore.trim() === ""
      ? null
      : Number(form.compatibilityScore)
    if (compatibilityScore !== null && (!Number.isFinite(compatibilityScore) || compatibilityScore < 0 || compatibilityScore > 5)) {
      setError("compatibility_score 必须为 0–5，或留空表示 null")
      return
    }
    const sessionCount = form.sessionCount.trim() === "" ? null : Number(form.sessionCount)
    if (sessionCount !== null && (!Number.isInteger(sessionCount) || sessionCount < 0 || sessionCount > 1_000_000)) {
      setError("session_count 必须为 0–1,000,000 的整数，或留空表示 null")
      return
    }

    let matchHistory: unknown
    try {
      matchHistory = JSON.parse(form.matchHistory)
    } catch {
      setError("match_history 必须是有效 JSON 数组或 null")
      return
    }
    if (matchHistory !== null && !Array.isArray(matchHistory)) {
      setError("match_history 必须是 JSON 数组或 null")
      return
    }

    setError(null)
    setMessage(null)
    startTransition(async () => {
      const nullable = (value: string) => value.trim() || null
      const result = await updateLegacyMemberAction({
        memberId,
        legacyId,
        payload: {
          member_no: form.memberNo.trim(),
          full_name: form.fullName.trim(),
          gender: nullable(form.gender),
          school: nullable(form.school),
          department: nullable(form.department),
          interest_tags: parseTagList(form.interestTags),
          social_tags: parseTagList(form.socialTags),
          game_mode: nullable(form.gameMode),
          compatibility_score: compatibilityScore,
          session_count: sessionCount,
          match_history: matchHistory,
          claim_status: form.claimStatus,
        },
        reason,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setReason("")
      setMessage(`历史记录 ${recordNumber} 已更新，并写入 before/after 审计`)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 text-rose-700" aria-hidden="true" />
        <h3 className="font-semibold text-rose-950">编辑历史原始记录 {recordNumber}（super_admin）</h3>
      </div>
      <p className="mt-1 text-xs leading-5 text-rose-900">
        canonical ID、关联外键、审核操作者、审计字段和技术时间不可在此覆盖；认领状态变更由数据库自动维护审核人和审核时间。
      </p>
      <form className="mt-4 grid gap-3 lg:grid-cols-2" onSubmit={save}>
        <label><span className="mb-1 block text-xs text-rose-900">member_no</span><input value={form.memberNo} onChange={(event) => setField("memberNo", event.target.value)} maxLength={100} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">full_name</span><input value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} maxLength={500} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">gender（可空）</span><input value={form.gender} onChange={(event) => setField("gender", event.target.value)} maxLength={500} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">school（可空）</span><input value={form.school} onChange={(event) => setField("school", event.target.value)} maxLength={500} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">department（可空）</span><input value={form.department} onChange={(event) => setField("department", event.target.value)} maxLength={500} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">game_mode（可空）</span><input value={form.gameMode} onChange={(event) => setField("gameMode", event.target.value)} maxLength={500} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">interest_tags（逗号或换行分隔）</span><textarea value={form.interestTags} onChange={(event) => setField("interestTags", event.target.value)} rows={3} className={`${INPUT_CLASS} py-2`} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">social_tags（逗号或换行分隔）</span><textarea value={form.socialTags} onChange={(event) => setField("socialTags", event.target.value)} rows={3} className={`${INPUT_CLASS} py-2`} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">compatibility_score（0–5，可空）</span><input type="number" min={0} max={5} step="any" value={form.compatibilityScore} onChange={(event) => setField("compatibilityScore", event.target.value)} className={INPUT_CLASS} disabled={pending} /></label>
        <label><span className="mb-1 block text-xs text-rose-900">session_count（可空）</span><input type="number" min={0} max={1_000_000} step={1} value={form.sessionCount} onChange={(event) => setField("sessionCount", event.target.value)} className={INPUT_CLASS} disabled={pending} /></label>
        <label className="lg:col-span-2"><span className="mb-1 block text-xs text-rose-900">claim_status</span><select value={form.claimStatus} onChange={(event) => setField("claimStatus", event.target.value)} className={INPUT_CLASS} disabled={pending}><option value="unclaimed">unclaimed</option><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option></select></label>
        <label className="lg:col-span-2"><span className="mb-1 block text-xs text-rose-900">match_history JSON 数组或 null</span><textarea value={form.matchHistory} onChange={(event) => setField("matchHistory", event.target.value)} rows={7} className={`${INPUT_CLASS} min-h-36 py-2 font-mono text-xs`} disabled={pending} /></label>
        <div className="lg:col-span-2"><ReasonInput value={reason} onChange={setReason} disabled={pending} /></div>
        <div className="lg:col-span-2 flex justify-end"><Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 4}><Save className="size-4" />{pending ? "保存中" : "保存历史原始记录"}</Button></div>
      </form>
      <ResultMessage error={error} message={message} />
    </section>
  )
}
