# 竹溪社 — 微信小程序设计系统

## 1. Visual Theme & Atmosphere

**设计哲学**: 日式侘寂 × 竹林清雅。界面如同竹林间的溪流——安静、有序、自然。
**信息密度**: 舒适留白，每屏聚焦一个任务。
**情绪基调**: 温暖可信、清新自然、低调高级。

---

## 2. Color Palette & Roles

### 核心色
| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Primary | 竹绿 | `#3C6E47` | 主按钮、导航栏、核心交互 |
| Primary Light | 浅竹绿 | `#E7F0E9` | 标签选中背景、卡片高亮 |
| Primary Dark | 深竹绿 | `#2A4F33` | 按钮 hover/active 状态 |

### 中性色
| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Background | 米白 | `#F7F6F2` | 页面底色 |
| Surface | 白瓷 | `#FFFFFF` | 卡片、弹窗 |
| Text Primary | 墨色 | `#2C2C2C` | 标题、正文 |
| Text Secondary | 灰竹 | `#7A7A6E` | 说明文字、次要信息 |
| Text Tertiary | 淡灰 | `#ABABAB` | placeholder、禁用态 |
| Border | 溪石 | `#E8E6E0` | 分割线、边框 |

### 功能色
| Role | Hex | Usage |
|------|-----|-------|
| Success | `#3C6E47` | 与主色一致，保存成功 |
| Warning | `#D4A853` | 竹黄，提醒状态 |
| Error | `#C25450` | 柔和红，错误/退出 |
| Info | `#5B8FA8` | 溪蓝，信息提示 |

---

## 3. Typography Rules

**字体栈**: 系统默认（微信小程序自动使用 PingFang SC / 思源黑体）

| Level | Size (rpx) | Weight | Color | Usage |
|-------|-----------|--------|-------|-------|
| H1 | 48 | 600 | #2C2C2C | 页面主标题 |
| H2 | 36 | 600 | #2C2C2C | 卡片标题 |
| H3 | 32 | 500 | #2C2C2C | 区块标题 |
| Body | 28 | 400 | #2C2C2C | 正文 |
| Caption | 24 | 400 | #7A7A6E | 说明、副标题 |
| Small | 22 | 400 | #ABABAB | 脚注、时间戳 |

**行高**: 正文 1.6，标题 1.3
**字间距**: 标题 2rpx，正文 0

---

## 4. Component Stylings

### Button 按钮
```
Primary:
  background: #3C6E47
  color: #FFFFFF
  border-radius: 16rpx
  height: 88rpx
  font-size: 32rpx, weight: 500
  active: background #2A4F33

Secondary:
  background: #FFFFFF
  color: #3C6E47
  border: 2rpx solid #3C6E47
  active: background #E7F0E9

Danger:
  background: #FFFFFF
  color: #C25450
  border: 2rpx solid #E8E6E0
  active: background #FDF2F2
```

### Card 卡片
```
background: #FFFFFF
border-radius: 20rpx
padding: 32rpx
margin-bottom: 24rpx
box-shadow: 0 2rpx 12rpx rgba(44, 44, 44, 0.04)
```

### Tag 标签（多选）
```
Default:
  background: #F7F6F2
  border: 2rpx solid #E8E6E0
  border-radius: 12rpx
  padding: 14rpx 28rpx
  font-size: 26rpx
  color: #2C2C2C

Active:
  background: #E7F0E9
  border-color: #3C6E47
  color: #2A4F33
```

### Form Row 表单行
```
padding: 24rpx 0
border-bottom: 1rpx solid #E8E6E0
label: 28rpx, color #7A7A6E, width 160rpx
value: 28rpx, color #2C2C2C, text-align right
placeholder: color #ABABAB
```

### Score Dot 评分点
```
size: 72rpx
border-radius: 50%
background: #F7F6F2
border: 2rpx solid #E8E6E0
active: background #E7F0E9, border-color #3C6E47

score-text: 28rpx, color #2C2C2C
```

### Progress Bar 进度条
```
track: height 12rpx, background #E8E6E0, border-radius 6rpx
fill: background #3C6E47, border-radius 6rpx
transition: width 0.4s ease
```

---

## 5. Layout Principles

### Spacing Scale (rpx)
```
4  — 微距（图标与文字间）
8  — 紧凑（标签间距）
16 — 标准（元素内间距）
24 — 舒适（段落间距、卡片间）
32 — 宽松（卡片内边距）
48 — 区域（section 间距）
```

### Page Layout
```
page-padding: 28rpx horizontal
safe-area-bottom: env(safe-area-inset-bottom)
max-width: 100%（小程序不需要 max-width）
```

---

## 6. Depth & Elevation

```
Level 0: 无阴影（内嵌元素）
Level 1: 0 2rpx 12rpx rgba(44,44,44,0.04) — 卡片
Level 2: 0 4rpx 20rpx rgba(44,44,44,0.08) — 弹窗、浮层
Level 3: 0 8rpx 32rpx rgba(44,44,44,0.12) — Toast
```

---

## 7. Design Guardrails

### DO
- 保持页面留白，每屏不超过 2-3 个主要信息区块
- 标签选中用 **背景色变化**，不用纯边框高亮
- 按钮圆角保持 16rpx，与卡片 20rpx 形成层次
- 分割线用 1rpx 实线 #E8E6E0

### DON'T
- 不使用纯黑 #000000，用 #2C2C2C
- 不使用蓝色作为主色（与微信原生 UI 混淆）
- 不在小程序里用渐变背景
- 不用阴影替代分割线
- 不用纯灰 #999，用带暖调的 #7A7A6E

---

## 8. Navigation Bar
```
background: #3C6E47
text-color: #FFFFFF
title: "竹溪社"
```

## 9. TabBar
```
color: #ABABAB（未选中）
selectedColor: #3C6E47（选中）
backgroundColor: #FFFFFF
borderStyle: black（顶部细线）
```
