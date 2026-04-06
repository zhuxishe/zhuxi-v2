import Link from "next/link"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SurveySuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <CheckCircle className="size-16 text-green-500 mb-4" />
      <h1 className="text-lg font-bold mb-2">问卷已提交！</h1>
      <p className="text-sm text-muted-foreground mb-6">
        我们会在问卷截止后为你安排最佳搭档
      </p>
      <div className="flex gap-3">
        <Link href="/app">
          <Button>返回首页</Button>
        </Link>
        <Link href="/app/matching/survey">
          <Button variant="outline">修改问卷</Button>
        </Link>
      </div>
    </div>
  )
}
