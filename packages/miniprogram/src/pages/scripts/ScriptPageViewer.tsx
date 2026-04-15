import { View, Text, Image, Swiper, SwiperItem } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

interface Props {
  title: string
  pages: string[]
}

export function ScriptPageViewer({ title, pages }: Props) {
  const [current, setCurrent] = useState(0)

  return (
    <View className="card">
      <Text className="section-label">剧本阅读</Text>
      <Swiper
        className="page-swiper"
        current={current}
        onChange={(e) => setCurrent(e.detail.current)}
        circular={false}
      >
        {pages.map((url, index) => (
          <SwiperItem key={url}>
            <Image
              className="page-image"
              src={url}
              mode="widthFix"
              onClick={() => Taro.previewImage({ current: url, urls: pages })}
            />
            <Text className="page-counter">{title} {index + 1}/{pages.length}</Text>
          </SwiperItem>
        ))}
      </Swiper>
      <Text className="page-hint">左右滑动翻页，点击图片可放大查看</Text>
    </View>
  )
}
