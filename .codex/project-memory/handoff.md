# 会话交接 — 2026-04-23 App / 后台 UI 重设计概念稿

## 2026-04-29 Web 公开页按 0425 修改方案重排
- 用户要求：读取 `D:\OneDrive\7_竹溪社\竹溪社app\田\0425修改方案.docx` 的文字与截图，按移动端优先重做 Web 公开页信息架构。
- 已确认：该 docx 内 13 张图片均可提取并视觉识别；当前首页截图对应 Hero、如何参加、数字区、成员心声、FAQ、联系我们、菜单、活动页和关于页。
- 已完成：
  - 首页收窄为宣传页：`HeroSection`、`AboutIntroSection`、`MissionSection`、`FaqSection`、Footer。
  - 首页移除深色数字证明区、成员心声区、联系表单区；Hero 删除按钮，统计改为 2x2。
  - 文案换成面向玩家的口吻，并同步 `zh/ja`。
  - 导航新增：`往期回顾`、`关于我们`；“怎么参加”改“如何参加”。
  - 精选活动页删除登录 CTA 和底部“关于竹溪社”引导卡，只展示后台精选活动。
  - `/organization` 改为公开“关于我们”页，新增陈风独占卡，其他 Staff 留在次级区块。
  - 新增 `/reviews` 往期回顾公开页。
  - 新增 `/admin/reviews` 往期回顾后台配置页。
  - 往期回顾后台新增图片 URL / 来源 URL 校验，公开页和后台预览使用 CSS URL 转义。
  - 新增 migration：`supabase/migrations/037_past_event_reviews.sql`。
  - 已通过 `supabase db query --db-url` 在远端 Supabase 应用 `past_event_reviews` 表、trigger、RLS policy、index。
- 验证：
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过，确认 `/reviews`、`/admin/reviews` 出现在 build route 列表。
  - Playwright 移动端截图已检查：`/`、`/scripts`、`/reviews`、`/organization` 均能渲染；截图在 `I:\temp\zhuxi-web-audit\`。
  - 远端已确认 `public.past_event_reviews` 存在，RLS policy 数量为 2。
  - GLM 复核：主需求符合；指出 URL 校验风险，已补图片/来源 URL 校验与 CSS URL 转义。
- 注意：
  - `supabase db push --dry-run` 因远端 migration history 和本地编号体系不一致未使用；本轮只逐条执行 `037` 的 SQL，没有 repair 迁移历史。
  - 现有工作区仍有用户/上一轮遗留未提交改动，提交时需要分开 staging，避免混入无关文件。

## 2026-04-24 玩家 App 启动动画补记
- 用户要求：玩家 App 启动时也加入动画，复用原首页入场动画里“叶子/粒子聚拢后的几秒”。
- 已完成：
  - 新增 `src/components/player/AppLaunchSplash.tsx`。
  - 复用原动画模块：
    - `projectUniversities`
    - `computeNetworkParticles`
    - `initParticles` / `drawParticles`
    - `generateLogoTargets`
    - `LogoReveal`
  - 没有改原首页入场动画帧；App splash 只从原主动画约 `270 -> 420` 帧播放，即后段粒子聚拢、logo reveal、淡出。
  - 接入 `src/app/app/layout.tsx`，只作用于 `/app/**` 玩家区。
  - 使用 `sessionStorage` 键 `zhuxi:app-launch-splash-seen`，同一浏览器 session 只播一次。
  - 支持 `prefers-reduced-motion: reduce` 自动跳过，并保留“跳过”按钮，避免卡死。
- 验证：
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过。
- 未覆盖：
  - 本地没有有效玩家登录 session，`/app` 会先被 `requireAuth()` 重定向到 `/login`，所以未做真实登录后的浏览器截图。上线后需用真实账号确认首次进入 `/app` 时动画出现且可跳过。

## 2026-04-24 依赖漏洞清零补记
- 用户要求：修复 GitHub 默认分支剩余 `1 moderate` 依赖漏洞，并继续推送。
- 根因：
  - `exceljs@4.4.0 -> uuid@8.3.2`
  - scoped 覆盖 `exceljs` 后，`packages/miniprogram -> @tarojs/webpack5-runner -> webpack-dev-server -> sockjs -> uuid@8.3.2` 也被 audit 暴露。
  - npm advisory `GHSA-w5hq-g745-h8pq` 要求 `uuid >=14.0.0`。
- 已完成：
  - 根 `package.json` 的 `pnpm.overrides` 新增 scoped overrides：`exceljs>uuid >=14.0.0`、`sockjs>uuid >=14.0.0`。
  - 更新 `pnpm-lock.yaml` 并同步本地 `node_modules`。
  - `pnpm why uuid` 确认当前解析为 `uuid@14.0.0 -> exceljs@4.4.0`。
- 验证：
  - `pnpm audit --json`：0 vulnerabilities。
  - `exceljs` 基础 `Workbook().xlsx.writeBuffer()`：通过。
  - `sockjs` CJS require：通过。
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过。
  - `pnpm --dir packages/miniprogram build:weapp`：通过。

## 2026-04-24 PWA 安装支持补记
- 用户要求：参考之前 TTS 项目，为竹溪社增加 PWA 安装能力，图标使用 `D:\OneDrive\7_竹溪社\剧本美工\logo\logosingle.png`。
- 已完成：
  - 从用户提供的 logo 生成 PWA 图标：`public/icons/icon-192.png`、`icon-512.png`、`maskable-icon-512.png`、`apple-touch-icon.png`。
  - 新增 `public/manifest.webmanifest`，`start_url=/`，`display=standalone`。
  - 新增 `public/sw.js`，只缓存公开壳层和静态资源；明确不拦截 `/admin`、`/app`、`/api`、登录回调，避免缓存登录态和业务数据。
  - 新增 `src/components/shared/PwaInstallPrompt.tsx`，在 Chrome/Edge/Android 支持安装时显示“安装竹溪社”提示；后台不显示，玩家区避开底部导航。
  - `src/app/layout.tsx` 增加 manifest、apple web app、icons metadata，并全局注册安装提示。
- 验证：
  - `JSON.parse` 校验 `zh/ja` 翻译和 manifest：通过。
  - 图标尺寸检查：192/512/maskable 512/apple 180 均正确。
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过。
  - 本地生产服务确认 `/manifest.webmanifest`、`/sw.js`、`/icons/icon-192.png` 均返回 200；首页 HTML 含 manifest 与 apple icon 链接。

## 本轮完成
- 用户要求：以高级 UI/UE 设计师角度，重新设计当前项目玩家 App 与管理后台 UI，先用 HTML 在 Chrome 打开，再列修改计划。
- 已读取现有交接信息与关键 UI 结构：
  - 玩家端：`src/app/app/layout.tsx`、`src/app/app/page.tsx`、`PlayerTopHeader`、`PlayerBottomNav`、`SurveyStatusCard`、`ProfileCompleteness`、`MatchCard`、`ScriptCard`
  - 后台：`src/app/admin/layout.tsx`、`AdminSidebar`、`AdminTopBar`、`DashboardStats`、`MatchingPage`、`MemberTable`、`RoundDetailClient`
- 新增独立 HTML 概念稿：
  - `output/frontend-design/zhuxi-app-admin-redesign-2026-04-23.html`
  - 截图：`output/frontend-design/zhuxi-app-admin-redesign-2026-04-23.png`
- 已用 Chrome 打开本地 HTML。
- 已用 Playwright 截图验证：
  - 页面非空
  - `logo.svg` 加载正常
  - DOM 宽度 1440，高度 3247
  - App / 后台 / 匹配工作台布局无明显重叠

## 设计方向
- 玩家 App：从“入口集合”改为“任务中心 + 活动发现”。
  - 首页优先显示本周活动、匹配问卷截止、资料完整度、LINE 状态。
  - 匹配页区分当前匹配与历史匹配。
  - 活动卡优先露出时间、地点、人数、预算，而不是只强调封面。
- 管理后台：从“大卡片列表”改为“运营工作台”。
  - 仪表板集中显示待处理队列、当前轮次、精选活动、系统提醒。
  - 匹配管理建议改为三栏：轮次列表 / 问卷提交表 / 当前操作与运行前检查。
  - 后台视觉应更高密度、更稳定、更像工具，避免营销页式大留白。

## 待用户确认
1. 玩家端首页第一优先级：活动入口，还是个人任务中心？
2. 后台日常核心：成员审核，还是匹配轮次运营？
3. 管理后台是否接受更高信息密度？

## 下一步建议
- 用户确认方向后，再进入源码实现。
- 实现时按项目规则拆分组件，保持每个文件小于 150 行。
- 修改后至少运行：
  - `pnpm typecheck`
  - `pnpm lint`
  - 相关页面 Playwright 截图检查

---

# 会话交接 — 2026-04-23 App / 后台 UI 第一阶段落地

## 用户确认
- 玩家端首页第一优先级：活动入口。
- 后台核心：匹配轮次运营。
- 后台可以接受更高信息密度。
- 要求：不要影响现有功能，按计划逐步 UI 优化。

## 本轮完成的源码改动
- 玩家 App 首页 `/app`
  - `src/app/app/page.tsx`
    - 保留原认证与 `resolvePlayerRoute()` 流程。
    - approved 玩家首页改为活动优先：精选活动卡、活动数量、匹配问卷入口、下一步任务。
    - 新增只读调用 `fetchLandingScripts(3)`，不改写数据。
  - 新增 `src/components/player/PlayerHomeActivityCard.tsx`
  - 新增 `src/components/player/PlayerHomeTasks.tsx`
  - `src/messages/zh.json` / `src/messages/ja.json` 增加 `playerHome` 新文案。
- 后台仪表板 `/admin`
  - `src/app/admin/page.tsx`
    - 新增读取 `fetchRounds()` / `fetchMatchSessions()`，用于运营总览。
  - 新增 `src/components/admin/AdminOperationsDashboard.tsx`
    - 首屏改为“匹配轮次运营”导向。
    - 展示总成员、待处理申请、开放轮次、匹配记录。
    - 展示处理队列与当前轮次入口。
- 后台匹配管理 `/admin/matching`
  - `src/app/admin/matching/page.tsx`
    - 页面收口为数据获取 + `MatchingWorkbench`。
  - 新增 `src/components/admin/MatchingWorkbench.tsx`
    - 三栏高密度结构：轮次列表 / 当前轮次与历史记录 / 轮次动作与运行前关注。
    - 保留原有轮次详情、取消申请、黑名单、历史 session 链接。
- 后台侧边栏
  - `src/components/admin/AdminSidebar.tsx`
    - 导航按“总览 / 运营 / 内容 / 系统”分组。
    - 保留所有原始路由。

## 验证结果
- `node JSON.parse zh/ja messages`：通过
- `pnpm typecheck`：通过
- `pnpm lint`：通过
- `pnpm build`：通过
- `pnpm test:unit`：78/78 通过
- Playwright + 本地 dev server 真实登录后台截图：
  - `output/ui-redesign-admin-dashboard.png`
  - `output/ui-redesign-admin-matching.png`
- 玩家端截图限制：
  - 使用现有 E2E player 登录后进入的是面试前信息表流程，不是 approved 玩家首页。
  - 因此 `output/ui-redesign-player-app.png` 不代表本轮 `/app` approved 首页视觉。

## 注意
- 当前 git 工作区中有一些本轮前已存在的未提交 landing 改动：
  - `src/app/page.tsx`
  - `src/components/landing/HeroSection.tsx`
  - `src/components/landing/BrandMotionSection.tsx` 删除状态
  - `src/messages/zh.json` / `src/messages/ja.json` 中 home 段落也有既有差异
- 本轮没有回退这些改动，只在消息文件追加了玩家首页所需 `playerHome` 文案键。
