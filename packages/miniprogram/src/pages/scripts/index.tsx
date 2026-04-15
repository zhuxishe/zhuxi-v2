import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { supabaseQuery } from '../../lib/supabase'
import { requireAuth } from '../../lib/auth'
import { rewriteStorageUrl } from '../../lib/storage-url'
import './index.scss'

interface Script {
  id: string
  title: string
  cover_url: string | null
  genre_tags: string[] | null
  player_count_min: number | null
  player_count_max: number | null
  budget: string | null
  location: string | null
}

const GENRE_FILTERS = ['全部', '推理', '情感', '恐怖', '欢乐', '机制', '阵营', '沉浸']

export default function Scripts() {
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('全部')

  useDidShow(() => {
    if (!requireAuth()) return
    loadScripts()
  })

  const loadScripts = async () => {
    setLoading(true)
    try {
      const data = await supabaseQuery<Script[]>('scripts', {
        select: 'id,title,cover_url,genre_tags,player_count_min,player_count_max,budget,location',
        is_published: 'eq.true',
        order: 'created_at.desc',
      })
      setScripts(data || [])
    } catch (err) {
      console.error('加载剧本失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = scripts.filter(s => {
    if (search && !s.title.includes(search)) return false
    if (genre !== '全部' && !s.genre_tags?.some(t => t.includes(genre))) return false
    return true
  })

  return (
    <View className="scripts-page">
      <Input className="search-input" placeholder="搜索剧本..."
        value={search} onInput={e => setSearch(e.detail.value)} />

      <View className="genre-tabs">
        {GENRE_FILTERS.map(g => (
          <View key={g} className={`genre-tab ${genre === g ? 'active' : ''}`}
            onClick={() => setGenre(g)}>
            <Text className="genre-text">{g}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <Text className="loading">加载中...</Text>
      ) : filtered.length === 0 ? (
        <View className="empty">
          <Text className="empty-text">暂无剧本</Text>
        </View>
      ) : (
        <View className="script-list">
          {filtered.map(s => (
            <View key={s.id} className="script-card"
              onClick={() => Taro.navigateTo({ url: `/pages/scripts/detail?id=${s.id}` })}>
              {s.cover_url && <Image className="script-cover" src={rewriteStorageUrl(s.cover_url)!} mode="aspectFill" />}
              <View className="script-info">
                <Text className="script-title">{s.title}</Text>
                <View className="script-meta">
                  {s.player_count_min && (
                    <Text className="meta-tag">{s.player_count_min}-{s.player_count_max || '?'}人</Text>
                  )}
                  {s.budget && <Text className="meta-tag">{s.budget}</Text>}
                  {s.location && <Text className="meta-tag">{s.location}</Text>}
                </View>
                {s.genre_tags?.length ? (
                  <View className="script-tags">
                    {s.genre_tags.map(t => (
                      <Text key={t} className="small-tag">{t}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
