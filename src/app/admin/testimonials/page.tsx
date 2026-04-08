import { requireAdmin } from "@/lib/auth/admin"
import { fetchAllTestimonials } from "@/lib/queries/testimonials"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { EmptyState } from "@/components/shared/EmptyState"
import { MessageCircle } from "lucide-react"
import { TestimonialList } from "./TestimonialList"
import { TestimonialForm } from "./TestimonialForm"

export default async function AdminTestimonialsPage() {
  const admin = await requireAdmin()
  const testimonials = await fetchAllTestimonials()

  return (
    <div>
      <AdminTopBar admin={admin} title="评论管理" />
      <div className="p-6 space-y-6">
        <TestimonialForm />

        {testimonials.length === 0 ? (
          <EmptyState icon={MessageCircle} title="暂无评论" description="添加第一条成员评论" />
        ) : (
          <TestimonialList testimonials={testimonials} />
        )}
      </div>
    </div>
  )
}
