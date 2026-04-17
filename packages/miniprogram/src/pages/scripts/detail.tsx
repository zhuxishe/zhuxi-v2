import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { rewriteStorageUrl } from '../../lib/storage-url'
import { getMemberId } from '../../lib/member'
import { resolveMiniScriptAccessView } from '../../lib/script-access'
import { ScriptAccessSection } from './ScriptAccessSection'
import { DIFFICULTY_MAP, ScriptDetail } from './script-detail-types'
import './detail.scss'

export default function ScriptDetailPage() {
  const router = useRouter()
  const { id } = router.params
  const [script, setScript] = useState<ScriptDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [canViewFull, setCanViewFull] = useState(false)
  const [openingPdf, setOpeningPdf] = useState(false)
  useDidShow(() => {
    if (!id) {
      setLoading(false)
      setScript(null)
      return
    }
    void loadScript()
  })

  const loadScript = async () => {
    try {
      // 先查权限，再决定查询哪些字段
      const access = await loadScriptAccess(id as string)
      setCanViewFull(access)

      const publicFields = 'id,title,title_ja,author,description,genre_tags,theme_tags,difficulty,player_count_min,player_count_max,duration_minutes,budget,location,language,warnings,cover_url,roles'
      const fullFields = publicFields + ',content_html,pdf_url,page_images'

      const scriptData = await supabaseQuery<ScriptDetail>('scripts', {
        select: access ? fullFields : publicFields,
        id: `eq.${id}`,
      }, { single: true })
      setScript(scriptData)
    } catch (err) {
      console.error('加载剧本失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenPdf = async (url: string) => {
    setOpeningPdf(true)
    try {
      const result = await Taro.downloadFile({ url })
      if (result.statusCode >= 400) throw new Error('下载 PDF 失败')
      await Taro.openDocument({ filePath: result.tempFilePath, showMenu: true })
    } catch (err: any) {
      Taro.showToast({ title: err.message || '打开 PDF 失败', icon: 'none' })
    } finally {
      setOpeningPdf(false)
    }
  }

  if (loading) return <View className="detail-page"><Text className="loading">加载中...</Text></View>
  if (!script) return <View className="detail-page"><Text className="error">未找到剧本</Text></View>

  const coverUrl = rewriteStorageUrl(script.cover_url)
  const pdfUrl = rewriteStorageUrl(script.pdf_url)
  const pageImages = script.page_images?.map((url) => rewriteStorageUrl(url) ?? url) ?? []
  const accessView = resolveMiniScriptAccessView(canViewFull, pageImages, pdfUrl)

  return (
    <View className="detail-page">
      {coverUrl && (
        <Image className="cover" src={coverUrl} mode="aspectFill" />
      )}

      <View className="card">
        <Text className="title">{script.title}</Text>
        {script.title_ja && <Text className="title-ja">{script.title_ja}</Text>}

        <View className="info-grid">
          {script.author && <InfoItem label="作者" value={script.author} />}
          {script.difficulty && <InfoItem label="难度" value={DIFFICULTY_MAP[script.difficulty] || script.difficulty} />}
          {script.player_count_min && (
            <InfoItem label="人数" value={`${script.player_count_min}-${script.player_count_max || '?'}人`} />
          )}
          {script.duration_minutes && <InfoItem label="时长" value={`${script.duration_minutes}分钟`} />}
          {script.budget && <InfoItem label="预算" value={script.budget} />}
          {script.location && <InfoItem label="地点" value={script.location} />}
          {script.language && <InfoItem label="语言" value={script.language} />}
        </View>
      </View>

      {script.genre_tags?.length || script.theme_tags?.length ? (
        <View className="card">
          {script.genre_tags?.length ? (
            <>
              <Text className="section-label">类型</Text>
              <View className="tag-row">
                {script.genre_tags.map(t => <Text key={t} className="tag green">{t}</Text>)}
              </View>
            </>
          ) : null}
          {script.theme_tags?.length ? (
            <>
              <Text className="section-label">主题</Text>
              <View className="tag-row">
                {script.theme_tags.map(t => <Text key={t} className="tag">{t}</Text>)}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {script.warnings?.length ? (
        <View className="card">
          <Text className="section-label">注意事项</Text>
          <View className="tag-row">{script.warnings.map(w => <Text key={w} className="tag warn">{w}</Text>)}</View>
        </View>
      ) : null}

      {(script.content_html || script.description) && (
        <View className="card">
          <Text className="section-label">简介</Text>
          <Text className="desc">
            {script.content_html ? script.content_html.replace(/<[^>]*>/g, '') : script.description}
          </Text>
        </View>
      )}

      {script.roles?.length ? (
        <View className="card">
          <Text className="section-label">角色 ({script.roles.length})</Text>
          {script.roles.map((r, i) => (
            <View key={i} className="role-item">
              <Text className="role-name">{r.name}{r.gender ? ` (${r.gender})` : ''}</Text>
              {r.description && <Text className="role-desc">{r.description}</Text>}
            </View>
          ))}
        </View>
      ) : null}

      <ScriptAccessSection
        title={script.title}
        accessView={accessView}
        openingPdf={openingPdf}
        onOpenPdf={handleOpenPdf}
      />
    </View>
  )
}

async function loadScriptAccess(scriptId: string) {
  try {
    const memberId = await getMemberId()
    const record = await supabaseQuery<{ can_view_full: boolean } | null>('script_play_records', {
      select: 'can_view_full',
      script_id: `eq.${scriptId}`,
      member_id: `eq.${memberId}`,
    }, { single: true })
    return record?.can_view_full ?? false
  } catch {
    return false
  }
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="info-item">
      <Text className="info-label">{label}</Text>
      <Text className="info-value">{value}</Text>
    </View>
  )
}
