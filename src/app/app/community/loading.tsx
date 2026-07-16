export default function CommunityLoading() {
  return (
    <div className="animate-pulse space-y-6 px-4 pb-7 pt-5" aria-label="正在加载社区">
      <div>
        <div className="h-8 w-20 rounded-lg bg-primary/12" />
        <div className="mt-2 h-4 w-56 rounded bg-muted" />
      </div>
      <div className="flex justify-between gap-3" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="size-14 shrink-0 rounded-full bg-secondary" />
        ))}
      </div>
      <div className="space-y-3" aria-hidden="true">
        <div className="h-5 w-24 rounded bg-muted" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-[20px] bg-card p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-secondary" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            </div>
            <div className="mt-4 h-4 w-4/5 rounded bg-muted" />
            <div className="mt-2 h-4 w-full rounded bg-muted" />
            <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
            <div className="mt-4 h-11 rounded-xl border-t border-border" />
          </div>
        ))}
      </div>
    </div>
  )
}
