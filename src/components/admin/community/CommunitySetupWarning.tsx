export function CommunitySetupWarning() {
  return (
    <div role="alert" className="rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm leading-6 text-orange-900">
      社区数据库结构尚未应用。请先在对应的 Supabase 预览环境执行社区第一版（V1）迁移，再刷新本页。
    </div>
  )
}
