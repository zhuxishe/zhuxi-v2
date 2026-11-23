import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState, type ReactNode } from 'react'
import { supabaseQuery } from '../../lib/supabase'

export function ReviewRoute({ matchId, children }: { matchId?: string; children: ReactNode }) {
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    matchId: string
    retry: number
    error?: boolean
    url?: string
  }>()
  useEffect(() => {
    let current = true
    if (!matchId) return
    // Existing rounds retain the original form. New rounds open on the website
    // until their native client ships. Resolve using the authenticated session.
    supabaseQuery<{ review_policy?: string; round_id: string | null }>(
      'rpc/player_get_match_review_route',
      {},
      {
        method: 'POST',
        body: { p_match_result_id: matchId },
      },
    )
      .then((route) => {
        if (!current) return
        if (route.review_policy === 'unified_v2' && !route.round_id) throw new Error('Missing round')
        const url =
          route.review_policy === 'unified_v2' && route.round_id
            ? 'https://www.zhuxishe.jp/app/matches/rounds/' +
              encodeURIComponent(route.round_id) +
              '/reviews'
            : undefined
        setResult({ matchId, retry, url })
      })
      .catch(() => {
        if (current) setResult({ matchId, retry, error: true })
      })
    return () => {
      current = false
    }
  }, [matchId, retry])

  if (matchId && (result?.matchId !== matchId || result.retry !== retry))
    return <View className="review-page">加载中...</View>
  if (!matchId || result?.error)
    return (
      <View className="review-page">
        <Text>暂时无法打开本场评价</Text>
        <Button onClick={() => setRetry((n) => n + 1)}>重试</Button>
      </View>
    )
  const webReviewUrl = result?.url
  if (webReviewUrl)
    return (
      <View className="review-page">
        <View className="form-card">
          <Text className="section-title">本场活动在网页端评价</Text>
          <Text>复制链接后在浏览器打开，登录后即可评价。</Text>
          <Button onClick={() => Taro.setClipboardData({ data: webReviewUrl })}>复制评价链接</Button>
        </View>
      </View>
    )

  return <>{children}</>
}
