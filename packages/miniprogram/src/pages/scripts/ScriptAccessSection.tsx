import { View, Text } from '@tarojs/components'
import { MiniScriptAccessView } from '../../lib/script-access'
import { ScriptPageViewer } from './ScriptPageViewer'

interface Props {
  title: string
  accessView: MiniScriptAccessView
  openingPdf: boolean
  onOpenPdf: (url: string) => void
}

export function ScriptAccessSection({ title, accessView, openingPdf, onOpenPdf }: Props) {
  if (accessView.view === 'pages') {
    return <ScriptPageViewer title={title} pages={accessView.pages} />
  }

  if (accessView.view === 'pdf' && accessView.pdfUrl) {
    return (
      <View className="card">
        <Text className="section-label">完整剧本</Text>
        <View className="action-btn" onClick={!openingPdf ? () => onOpenPdf(accessView.pdfUrl!) : undefined}>
          <Text className="action-btn-text">{openingPdf ? '打开中...' : '打开 PDF'}</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="card restricted-card">
      <Text className="restricted-title">需要解锁权限</Text>
      <Text className="restricted-desc">参加过该剧本或获得查看权限后，才可阅读完整内容。</Text>
    </View>
  )
}
