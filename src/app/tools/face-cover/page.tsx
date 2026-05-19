import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "照片遮脸工作台 | 竹溪社",
  description: "竹溪社本地照片遮脸工具，照片只在浏览器中处理。",
}

export default function FaceCoverToolPage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#f7f3ea]">
      <iframe
        src="/apps/face-cover/index.html"
        title="竹溪社照片遮脸工作台"
        className="h-full w-full border-0"
      />
    </main>
  )
}
