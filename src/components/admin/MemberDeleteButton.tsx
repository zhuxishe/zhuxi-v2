"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { hardDeleteMember } from "@/app/admin/members/[id]/edit/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogTrigger, DialogContent,
  DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Trash2 } from "lucide-react"

interface Props {
  memberId: string
  memberName: string
}

export function MemberDeleteButton({ memberId, memberName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = input.trim() === memberName.trim()

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const result = await hardDeleteMember(memberId)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setOpen(false)
    router.push("/admin/members")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" />
        }
      >
        <Trash2 className="size-4 mr-1" />
        彻底删除
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>彻底删除成员</DialogTitle>
          <DialogDescription>
            此操作不可恢复。将永久删除该成员及其所有关联数据。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm">
            请输入成员姓名 <strong>{memberName}</strong> 以确认删除：
          </p>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/50"
            placeholder={memberName}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={!canDelete || loading}
            onClick={handleDelete}
          >
            {loading ? "删除中..." : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
