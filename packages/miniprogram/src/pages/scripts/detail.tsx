import { View, Text, Image } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import './detail.scss'

interface ScriptDetail {
  id: string
  title: string
  title_ja: string | null
  author: string | null
  description: string | null
  genre_tags: string[] | null
  theme_tags: string[] | null
  difficulty: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration_minutes: number | null
  budget: string | null
  location: string | null
  language: string | null
  warnings: string[] | null
  cover_url: string | null
  roles: { name: string; gender?: string; description?: string }[] | null
}

const DIFFICULTY_MAP: Record<string, string> = {
  beginner: '新手', intermediate: '进阶', advanced: '高阶',
}

export default function ScriptDetail() {
  const router = useRouter()
  const { id } = router.params
  const [script, setScript] = useState<ScriptDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useDidShow(() => { if (id) loadScript() })

  const loadScript = async () => {
    try {
      const data = await supabaseQuery<ScriptDetail>('scripts', {
        select: 'id,title,title_ja,author,description,genre_tags,theme_tags,difficulty,player_count_min,player_count_max,duration_minutes,budget,location,language,warnings,cover_url,roles',
        id: `eq.${id}`,
      }, { single: true })
      setScript(data)
    } catch (err) {
      console.error('加载剧本失败:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <View className="detail-page"><Text className="loading">加载中...</Text></View>
  }
  if (!script) {
    return <View className="detail-page"><Text className="error">未找到剧本</Text></View>
  }

  return (
    <View className="detail-page">
      {script.cover_url && (
        <Image className="cover" src={script.cover_url} mode="aspectFill" />
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
          <View className="tag-row">
            {script.warnings.map(w => <Text key={w} className="tag warn">{w}</Text>)}
          </View>
        </View>
      ) : null}

      {script.description && (
        <View className="card">
          <Text className="section-label">简介</Text>
          <Text className="desc">{script.description}</Text>
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
    </View>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View className="info-item">
      <Text className="info-label">{label}</Text>
      <Text className="info-value">{value}</Text>
    </View>
  )
}
