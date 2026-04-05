# 竹溪社 V2 — 项目指令

## 新会话启动协议
1. 读 `.claude/project-memory/handoff.md` — 当前状态
2. 读 `C:\Users\yunyo\.claude\plans\woolly-wandering-panda.md` — 完整实施计划

## 项目基本信息
- 技术栈：Next.js 16.x + Supabase (东京) + TypeScript + Tailwind 4 + shadcn/ui
- 部署：Vercel（待创建）
- 包管理：pnpm
- 回复语言：中文
- UI 风格：参照田的原型，简单高档

## 代码原则（严格遵守）
1. **每个文件 < 150 行** — 超过就拆分
2. **一个组件一个文件** — 绝不混合
3. **一个功能一个函数** — 单一职责
4. **Server Action 独立文件** — actions.ts 与页面分离
5. **查询函数按表拆分** — src/lib/queries/members.ts 等，不要一个大 queries.ts
6. **类型集中** — src/types/index.ts
7. **标签常量集中** — src/lib/constants/tags.ts

## 双语规范（i18n）
- 使用 next-intl，基于 cookie 切换
- 翻译文件：src/messages/zh.json + src/messages/ja.json
- 客户端：useTranslations("namespace")
- 服务端：await getTranslations("namespace")
- **管理后台保持中文，不需要 i18n**

## 旧项目复用
- 旧 App 代码：I:\app\zhuxi\src
- 匹配算法：I:\app\zhuxi-matching\src\lib\matching
- 复制组件时需要适配新项目结构，去掉不需要的依赖

## 技术禁区
- 不要创建 middleware.ts（Next.js 16.x 用 src/proxy.ts）
- 不要在 router.push() 后加 router.refresh()
- 不要把所有查询写在一个文件里
