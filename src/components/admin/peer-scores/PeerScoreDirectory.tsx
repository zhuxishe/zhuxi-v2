import Link from "next/link"
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { formatAdminDateTime } from "@/lib/admin-datetime"
import { PEER_SCORE_DIRECTORY_SORTS, PEER_SCORE_DIRECTORY_STATUSES, PEER_SCORE_STATUS_LABELS, peerScoreDirectoryHref } from "@/lib/member-master/peer-score-directory-controls"
import type { MemberPeerScoreDirectoryResult, PeerScoreDirectoryControls, PeerScoreDirectoryMember } from "@/types/member-peer-score-directory"

const INPUT_CLASS = "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
const LINK_CLASS = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const ROW_COLUMNS = "lg:grid-cols-[minmax(0,1.5fr)_3.5rem_3rem_3rem_3rem_6.5rem_8rem]"

export function PeerScoreDirectory({ result, controls, canSearchMemberNumber }: {
  result: MemberPeerScoreDirectoryResult | { status: "error" }
  controls: PeerScoreDirectoryControls
  canSearchMemberNumber: boolean
}) {
  const data = result.status === "ready" ? result.data : null
  const canNumber = data?.canViewMemberNumber ?? canSearchMemberNumber
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 p-3 sm:p-6">
    <div className="space-y-1.5 px-1">
      <p className="text-sm leading-6 text-muted-foreground">默认显示全部正式玩家，包括暂无有效评分的成员。当前仅供后台参考，会员端原有合拍分保持不变。</p>
      <p className="text-xs leading-5 text-muted-foreground">先求每位评价人所给评分的平均值，再对评价人等权平均。样本达标需至少 2 位不同评价人、覆盖 3 场有有效评分的活动，达标不会自动公开。</p>
    </div>

    <form action="/admin/peer-scores" method="get" aria-label="筛选合拍分数名单" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_9rem_11rem_8rem_auto] xl:items-end">
      <label className="min-w-0 text-xs font-medium text-muted-foreground"><span className="mb-1.5 block">搜索成员</span><span className="relative block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4" /><input name="search" type="search" defaultValue={controls.search} maxLength={100} placeholder={canNumber ? "姓名、昵称或会员编号" : "姓名或昵称"} className={`${INPUT_CLASS} pl-9`} /></span></label>
      <label className="text-xs font-medium text-muted-foreground"><span className="mb-1.5 block">样本状态</span><select name="status" defaultValue={controls.status} className={INPUT_CLASS}>{PEER_SCORE_DIRECTORY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground"><span className="mb-1.5 block">排序依据</span><select name="sort" defaultValue={controls.sort} className={INPUT_CLASS}>{PEER_SCORE_DIRECTORY_SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground"><span className="mb-1.5 block">顺序</span><select name="direction" defaultValue={controls.direction} className={INPUT_CLASS}><option value="desc">降序</option><option value="asc">升序</option></select></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1"><button type="submit" className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">查询</button><Link href="/admin/peer-scores" className={LINK_CLASS}>重置</Link></div>
    </form>

    {result.status === "unavailable" ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">合拍分数名单暂未配置，待后台数据功能就绪后可查看。现有成员资料和评分记录不受影响。</p> : null}
    {result.status === "error" ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p>合拍分数名单读取失败，请稍后重试。这不表示没有成员或评价。</p><Link href={peerScoreDirectoryHref(controls, controls.page)} className="mt-2 inline-flex min-h-10 items-center font-medium underline underline-offset-4">重新读取名单</Link></div> : null}
    {data ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm"><p>共 <strong className="tabular-nums">{data.total}</strong> 位成员</p><p className="text-xs text-muted-foreground">无有效评分的成员始终排在后面</p></div>
      {data.members.length ? <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        <div aria-hidden="true" className={`hidden items-center gap-x-4 border-b border-border bg-muted/30 px-3 py-2.5 text-xs font-medium text-muted-foreground lg:grid ${ROW_COLUMNS}`}>
          <span>成员 · 昵称{data.canViewMemberNumber ? " · 编号" : ""}</span><span className="text-center">试算分</span><span className="text-center">人数</span><span className="text-center">活动数</span><span className="text-center">有效条数</span><span className="text-center">样本状态</span><span className="text-right">最近收到评分</span>
        </div>
        <ul className="divide-y divide-border" aria-label="合拍分数成员名单">{data.members.map((member) => <PeerScoreMemberRow key={member.memberId} member={member} canViewMemberNumber={data.canViewMemberNumber} />)}</ul>
      </div> : <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center"><p className="font-medium">没有符合条件的成员</p><p className="mt-2 text-sm text-muted-foreground">可调整搜索词或样本状态后重试。</p></div>}
      <DirectoryPagination total={data.total} page={data.page} pageSize={data.pageSize} controls={controls} />
    </> : null}
  </div>
}

function PeerScoreMemberRow({ member, canViewMemberNumber }: { member: PeerScoreDirectoryMember; canViewMemberNumber: boolean }) {
  const href = `/admin/peer-scores/${encodeURIComponent(member.memberId)}`
  return <li className="min-w-0">
    <Link href={href} aria-label={`查看${member.fullName}的合拍分数详情`} className={`group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary lg:gap-x-4 lg:py-2.5 ${ROW_COLUMNS}`}>
      <div className="min-w-0"><p className="break-words text-sm font-semibold text-primary group-hover:underline">{member.fullName}<ArrowRight aria-hidden="true" className="ml-1 inline-block size-3.5 align-text-bottom" /></p>{member.nickname || canViewMemberNumber ? <p className="mt-0.5 flex flex-wrap gap-x-2 break-words text-xs leading-5 text-muted-foreground">{member.nickname ? <span>昵称：{member.nickname}</span> : null}{canViewMemberNumber ? <span>会员编号：{member.memberNumber || "未分配"}</span> : null}</p> : null}</div>
      <p className="text-right text-lg font-semibold tabular-nums text-primary lg:text-center"><span className="sr-only">试算分：</span>{member.score === null ? "—" : member.score.toFixed(1)}</p>
      <dl className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs lg:contents">
        <Stat label="评价" value={member.reviewerCount} unit="人" /><Stat label="活动" value={member.activityCount} unit="场" /><Stat label="评分" value={member.reviewCount} unit="条" />
        <div className="ml-auto lg:ml-0 lg:text-center"><dt className="sr-only">样本状态</dt><dd><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${member.sampleStatus === "ready" ? "bg-emerald-50 text-emerald-800" : member.sampleStatus === "accumulating" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>{PEER_SCORE_STATUS_LABELS[member.sampleStatus]}</span></dd></div>
      </dl>
      <p className="col-span-2 text-xs leading-5 text-muted-foreground lg:col-span-1 lg:text-right"><span className="lg:sr-only">最近收到评分：</span>{formatAdminDateTime(member.latestReviewAt, "暂无")}</p>
    </Link>
  </li>
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div className="min-w-0 lg:text-center"><dt className="mr-1 inline text-muted-foreground lg:sr-only">{label}</dt><dd className="inline font-medium tabular-nums lg:text-sm">{value}<span className="ml-0.5 font-normal text-muted-foreground lg:sr-only">{unit}</span></dd></div>
}

function DirectoryPagination({ total, page, pageSize, controls }: { total: number; page: number; pageSize: number; controls: PeerScoreDirectoryControls }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  return <nav aria-label="合拍分数名单分页" className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:flex-row">
    <p className="text-muted-foreground">第 {page} / {totalPages} 页 · 每页 {pageSize} 人</p>
    <div className="flex flex-wrap justify-center gap-2">
      {page > 1 ? <Link href={peerScoreDirectoryHref(controls, page - 1)} className={LINK_CLASS}><ChevronLeft className="size-4" aria-hidden="true" />上一页</Link> : <span aria-disabled="true" className={`${LINK_CLASS} opacity-40`}><ChevronLeft className="size-4" aria-hidden="true" />上一页</span>}
      {page < totalPages ? <Link href={peerScoreDirectoryHref(controls, page + 1)} className={LINK_CLASS}>下一页<ChevronRight className="size-4" aria-hidden="true" /></Link> : <span aria-disabled="true" className={`${LINK_CLASS} opacity-40`}>下一页<ChevronRight className="size-4" aria-hidden="true" /></span>}
    </div>
  </nav>
}
