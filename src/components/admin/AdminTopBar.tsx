import type { AdminUser } from "@/types"

interface Props {
  admin: AdminUser
  title: string
}

export function AdminTopBar({ admin, title }: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{admin.name}</span>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {admin.role === "super_admin" ? "超级管理员" : "管理员"}
        </span>
      </div>
    </header>
  )
}
