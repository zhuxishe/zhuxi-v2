import Link from "next/link"
import type { CommunityAdminContentFilters } from "./types"
import { COMMUNITY_ADMIN_INPUT_CLASS, COMMUNITY_ADMIN_LABEL_CLASS } from "./community-admin-ui"

export function CommunityContentFilters({ filters }: { filters: CommunityAdminContentFilters }) {
  return (
    <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="sm:col-span-2">
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>搜索公开昵称、标题或正文</span>
        <input name="q" maxLength={100} defaultValue={filters.query ?? ""} placeholder="输入关键词" className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>内容类型</span>
        <select name="type" defaultValue={filters.type ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS}>
          <option value="">全部类型</option>
          <option value="treehole">树洞</option>
          <option value="photo">照片动态</option>
          <option value="comment">评论</option>
          <option value="reply">回复</option>
        </select>
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>当前状态</span>
        <select name="status" defaultValue={filters.status ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS}>
          <option value="">全部状态</option>
          <option value="published">已发布</option>
          <option value="hidden">已隐藏</option>
          <option value="deleted">已删除</option>
        </select>
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>举报情况</span>
        <select name="reports" defaultValue={filters.reports ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS}>
          <option value="">全部内容</option>
          <option value="pending">有待处理举报</option>
          <option value="any">有举报记录</option>
          <option value="none">无举报记录</option>
        </select>
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>发布身份</span>
        <select name="anonymous" defaultValue={filters.anonymous === true ? "yes" : filters.anonymous === false ? "no" : ""} className={COMMUNITY_ADMIN_INPUT_CLASS}>
          <option value="">全部身份</option>
          <option value="yes">匿名内容</option>
          <option value="no">公开身份</option>
        </select>
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>开始日期（日本时间）</span>
        <input name="from" type="date" defaultValue={filters.from ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>结束日期（日本时间）</span>
        <input name="to" type="date" defaultValue={filters.to ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4 xl:justify-end">
        <Link href="/admin/community/content" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">重置</Link>
        <button type="submit" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">筛选</button>
      </div>
    </form>
  )
}
