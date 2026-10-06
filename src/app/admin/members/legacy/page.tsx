import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAdmin } from "@/lib/auth/admin"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { fetchLegacyMemberStatus } from "@/lib/queries/member-overview"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { parseMemberDirectoryPage } from "@/components/admin/member-center-utils"

interface Props {
  searchParams: Promise<{
    search?: string | string[]
    filter?: string | string[]
    page?: string | string[]
  }>
}

const filters = ["all", "activated", "inactive", "unverified"] as const
type StatusFilter = typeof filters[number]

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LegacyMembersPage({ searchParams }: Props) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") {
    return (
      <div>
        <AdminTopBar admin={admin} title="老用户状态" />
        <div className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">仅超级管理员可查看老用户名单。</p>
          <BackLink />
        </div>
      </div>
    )
  }

  const params = await searchParams
  const search = first(params.search)?.trim() ?? ""
  const rawFilter = first(params.filter)
  const filter: StatusFilter = filters.includes(rawFilter as StatusFilter) ? rawFilter as StatusFilter : "all"
  let directory: Awaited<ReturnType<typeof fetchLegacyMemberStatus>>
  try {
    directory = await fetchLegacyMemberStatus({
      search,
      filter,
      page: parseMemberDirectoryPage(first(params.page)),
      pageSize: 50,
    })
  } catch (error) {
    console.error("[LegacyMembersPage]", error)
    return (
      <div>
        <AdminTopBar admin={admin} title="老用户状态" />
        <div className="space-y-3 p-6">
          <BackLink />
          <p role="alert" className="rounded-xl bg-card p-4 text-sm text-destructive">老用户状态读取失败，请稍后重试。</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <AdminTopBar admin={admin} title="老用户状态" />
      <div className="space-y-4 p-4 sm:p-6">
        <BackLink />
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-xl font-semibold">老用户状态</h1>
          <p className="text-sm text-muted-foreground" title="已激活：关联老用户名单、账号正常且曾成功登录；审核是否通过另列展示">
            已激活 <strong className="text-primary">{directory.summary.activated}</strong> / {directory.summary.total}
          </p>
        </div>

        <form action="/admin/members/legacy" method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="legacy-search" className="sr-only">搜索姓名或预留编号</label>
          <input id="legacy-search" type="search" name="search" defaultValue={search} placeholder="姓名或预留编号" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs" />
          <label htmlFor="legacy-filter" className="sr-only">激活状态</label>
          <select id="legacy-filter" name="filter" defaultValue={filter} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">全部</option>
            <option value="activated">已激活</option>
            <option value="inactive">已确认未激活</option>
            <option value="unverified">待核实</option>
          </select>
          <Button type="submit" size="sm">筛选</Button>
          {(search || filter !== "all") && <Link href="/admin/members/legacy" className="text-sm text-muted-foreground hover:text-primary">重置</Link>}
        </form>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span><span className="font-semibold text-green-700">✓</span> 是</span>
          <span><span className="font-semibold text-red-600">✕</span> 否</span>
          <span>— 待确认或无记录</span>
        </p>

        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">玩家姓名</th>
                <th scope="col" className="px-4 py-3 font-medium">预留会员编号</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">是否注册</th>
                <th scope="col" className="px-4 py-3 text-center font-medium" title="当前账号的审核结果，不代表已参加实际面试">审核通过</th>
                <th scope="col" className="px-4 py-3 text-center font-medium" title="是否曾成功登录，不表示当前在线">曾登录</th>
                <th scope="col" className="px-4 py-3 font-medium">最近登录（日本时间）</th>
                <th scope="col" className="px-4 py-3 font-medium">账号状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {directory.items.map((member) => (
                <tr key={member.memberNumber} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {member.memberId ? <Link href={`/admin/members/${member.memberId}`} className="hover:text-primary hover:underline">{member.fullName}</Link> : member.fullName}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{member.memberNumber}</td>
                  <td className="px-4 py-3 text-center"><StatusMark value={member.registered} yes="已注册" no="未绑定登录账号" unknown="尚未确认账号关联" /></td>
                  <td className="px-4 py-3 text-center"><StatusMark value={member.approved} yes="审核通过" no="审核未通过" unknown="待审核或无审核记录" /></td>
                  <td className="px-4 py-3 text-center"><StatusMark value={member.hasLoggedIn} yes="曾成功登录" no="尚无成功登录记录" unknown="无可确认的登录记录" /></td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{formatAdminDateTime(member.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{accountStatusLabel(member.accountStatus)}</td>
                </tr>
              ))}
              {directory.items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">没有符合条件的老用户。</td></tr>}
            </tbody>
          </table>
        </div>
        <Suspense fallback={null}>
          <Pagination total={directory.total} page={directory.page} pageSize={directory.pageSize} />
        </Suspense>
      </div>
    </div>
  )
}

function BackLink() {
  return <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" className="size-4" />返回总览</Link>
}

function StatusMark({ value, yes, no, unknown }: { value: boolean | null; yes: string; no: string; unknown: string }) {
  const label = value === true ? yes : value === false ? no : unknown
  const color = value === true ? "text-green-700" : value === false ? "text-red-600" : "text-muted-foreground"
  return <span role="img" title={label} aria-label={label} className={`text-lg font-semibold ${color}`}>{value === true ? "✓" : value === false ? "✕" : "—"}</span>
}

function accountStatusLabel(status: string) {
  return ({ active: "正常", suspended: "暂停", closed: "已关闭", unbound: "未绑定", retired: "编号已退役", unverified: "待核实" } as Record<string, string>)[status] ?? "待核实"
}
