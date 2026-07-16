import type { ReactNode } from "react"
import type { AdminUser } from "@/types"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { CommunityAdminNav } from "./CommunityAdminNav"

interface CommunityAdminPageProps {
  admin: AdminUser
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

export function CommunityAdminPage({
  admin,
  title,
  description,
  actions,
  children,
}: CommunityAdminPageProps) {
  return (
    <div className="min-h-full bg-muted/20">
      <AdminTopBar admin={admin} title={title} />
      <CommunityAdminNav />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {children}
      </main>
    </div>
  )
}
