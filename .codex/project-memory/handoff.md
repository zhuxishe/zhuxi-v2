# 会话交接 — 2026-04-23 App / 后台 UI 重设计概念稿

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
