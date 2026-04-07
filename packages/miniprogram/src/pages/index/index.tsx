import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { isLoggedIn } from '../../lib/supabase'
import { wechatLogin } from '../../lib/auth'
import './index.scss'

export default function Index() {
  const [loading, setLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [memberStatus, setMemberStatus] = useState('')
  const [debugInfo, setDebugInfo] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setDebugInfo('')

    try {
      // Step 1: wx.login
      setDebugInfo('步骤 1: 获取微信 code...')
      const loginRes = await Taro.login()
      if (!loginRes.code) {
        setDebugInfo('错误: wx.login 未返回 code')
        return
      }
      setDebugInfo(`步骤 1 完成, code: ${loginRes.code.slice(0, 10)}...`)

      // Step 2: call edge function
      setDebugInfo(prev => prev + '\n步骤 2: 调用服务器认证...')
      const result = await wechatLogin()
      setLoggedIn(true)
      setMemberStatus(result.member.status)
      setDebugInfo(prev => prev + '\n登录成功!')

      Taro.showToast({
        title: result.isNewUser ? '注册成功' : '登录成功',
        icon: 'success',
      })
    } catch (err: any) {
      const msg = err?.message || err?.errMsg || String(err)
      console.error('登录失败:', err)
      setDebugInfo(prev => prev + `\n错误: ${msg}`)
      Taro.showToast({ title: '登录失败', icon: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="index">
      <View className="header">
        <Text className="title">竹溪社</Text>
        <Text className="subtitle">剧本杀社团</Text>
      </View>

      <View className="content">
        {!loggedIn ? (
          <Button
            className="login-btn"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? '登录中...' : '微信登录'}
          </Button>
        ) : (
          <View className="logged-in">
            <Text className="status-text">已登录</Text>
            <Text className="status-detail">
              会员状态: {memberStatus || '加载中...'}
            </Text>
          </View>
        )}
      </View>

      {debugInfo ? (
        <View className="debug-box">
          <Text className="debug-text">{debugInfo}</Text>
        </View>
      ) : null}
    </View>
  )
}
