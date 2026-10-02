import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Search } from "lucide-react"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchPendingApplications } from "@/lib/queries/pending-applications"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { PendingApplicationsQueue } from "@/components/admin/pending-applications/PendingApplicationsQueue"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { parseMemberDirectoryPage } from "@/components/admin/member-center-utils"

export default async function PendingApplicationsPage({ searchParams }: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const admin = await requireAdmin()
  const params = await searchParams
  const search = (params.search ?? "").trim().slice(0, 100)
  const requestedPage = parseMemberDirectoryPage(params.page)
  const applications = await fetchPendingApplications({ search, page: requestedPage })

  return (
    <div>
      <AdminTopBar admin={admin} title="待处理申请" />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:p-6 lg:p-8">
        <Link href="/admin" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft aria-hidden="true" className="size-4" />返回仪表板
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary">成员审核</p>
            <h1 className="heading-display mt-2 text-2xl sm:text-3xl">待处理申请</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">核对已提交的资料后填写说明，可逐个通过，也可勾选批量处理。</p>
          </div>
          <Link href="/admin/members" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-muted">
            全部成员<ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </header>

        <section aria-label="申请筛选" className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="shrink-0">
            <p className="text-sm font-medium">{search ? "搜索结果" : "等待审核"}<span className="ml-2 rounded-full bg-bamboo-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary">{applications.total} 人</span></p>
            <p className="mt-1.5 text-xs text-muted-foreground">按提交时间排列，较早申请优先</p>
          </div>
          <form action="/admin/members/pending" role="search" className="flex w-full flex-wrap items-center gap-2 sm:max-w-md">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">搜索姓名、昵称或学校</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <input key={search} type="search" name="search" defaultValue={search} maxLength={100} placeholder="搜索姓名、昵称或学校" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
            </label>
            <Button type="submit" variant="outline" className="h-10">搜索</Button>
            {search && <Link href="/admin/members/pending" className="inline-flex min-h-10 items-center px-1 text-sm text-muted-foreground hover:text-primary">清除</Link>}
          </form>
        </section>

        <PendingApplicationsQueue key={`${search}:${requestedPage}`} items={applications.items} />
        <Pagination total={applications.total} page={applications.page} pageSize={applications.pageSize} />
      </div>
    </div>
  )
}
