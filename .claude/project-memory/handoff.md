# 会话交接 — 2026-04-16 （人格配图完成 + 文档整理）

## 当前状态
- **main 分支** `4aee24f`，已 push，Vercel 自动部署
- Supabase 东京：当前业务库为 `wjjhprflldvclulistcx`（项目名 `zhuxishe`）；老玩家同步数据已写入该库的 `legacy_members` / `legacy_member_sources`
- Edge Function `wechat-auth` v5（含孤儿用户容错）
- Vercel: zhuxi-v2.vercel.app
- 安全漏洞：35 → 10（0 critical，剩余为 Taro 间接依赖/devDeps）

---

## 04-22 首页 IntroOverlay 白屏卡死修复补记
- 用户反馈：首页卡死在开场动画白屏层，右下角“跳过”点击无反应。
- 根因判断：
  - 上轮为避免复访重复播放，在 `IntroOverlay` 里新增了 `sessionStorage` 读写。
  - 如果浏览器隐私模式、嵌入环境或异常 WebView 禁止 `sessionStorage`，`useState` 初始化或 `done()` 点击路径会同步抛错。
  - 抛错会导致 hydration/点击处理链中断，表现为白色 overlay 留在页面上，跳过按钮无效。
- 已修复：
  - `src/components/landing/IntroOverlay.tsx`
  - `sessionStorage.getItem/setItem` 改为安全 try/catch 包装。
  - 即使无法写入 session 标记，`setHidden(true)` 仍会继续执行。
  - `matchMedia` 也增加存在性判断，避免极端浏览器环境下 reduced-motion 订阅抛错。
- 复核：
  - 已按用户要求调用 `glm-provider`；GLM 给出闭包方向，但本地代码判断闭包不是主因，因为 `done` 只使用 ref 与稳定 setState。
  - 最终按可复现的同步 storage 异常路径修复。
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过
  - Playwright production smoke：
    - 正常浏览器：点击“跳过”后 overlay 消失，无 JS error。
    - 强制 `sessionStorage.getItem/setItem` 抛 `SecurityError`：点击“跳过”后 overlay 仍可消失，无 JS error。

---

## 04-22 公开精选活动页设计统一补记
- 用户指出 `/scripts` 公开页设计语言没有和首页统一。
- 已确认问题：
  - 原 `/scripts` 使用旧版居中标题 + 竖版大卡片。
  - 与首页新方向（Starbucks 转译：暖奶油底、深绿色功能头图、白色实体卡片、pill CTA）不一致。
- 已修复：
  - `src/app/scripts/page.tsx` 去掉额外 `pt-16`，由页面区块自己控制顶部节奏。
  - `src/components/landing/ScriptsSection.tsx` 改为：
    - 暖奶油背景
    - 深绿色圆角头图区
    - 白色 pill CTA
    - 16:10 活动封面卡
    - 白色活动卡 + pill 元信息标签
  - `src/messages/zh.json` / `src/messages/ja.json` 增加公开活动页 kicker 与 CTA 文案。
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过
  - 本地 production `/scripts` 截图审查：通过，当前活动图片正常显示。

---

## 04-22 首页 CTA / 精选活动图片 / 动画复访修复补记
- 用户反馈：
  1. `填写匹配偏好` 是否应该进登录页不明确。
  2. `/scripts` 精选活动中部分图片不显示。
  3. 从精选活动页点击顶部导航回首页锚点时，首页动画会再次播放。
- 已修复：
  1. Hero 次 CTA 从直连 `/app/matching/survey` 改为 `/login?next=/app/matching/survey`。
     - 邮箱密码登录成功后会跳回 `next`。
     - Google 登录 callback 会读取安全的 `next` 并在用户状态允许时跳回。
     - LINE 登录成功后也使用同一 `nextPath`。
  2. `rewriteStorageUrl()` 不再硬编码改写到 `https://api.zhuxishe.com`。
     - 默认直接使用 Supabase Storage 公开 URL。
     - 若以后需要 CDN/代理，使用 `NEXT_PUBLIC_STORAGE_PROXY_ORIGIN` 显式开启。
     - 已确认原本失败的 3 个 WebP 封面源地址均为 `200 image/webp`。
  3. `IntroOverlay` 增加 session 级已播放标记：
     - 同一浏览器标签内看过/跳过后不再重复播放。
     - 带 hash 进入首页时默认跳过动画，用于 `/scripts` 顶部导航返回 `/#mission` 等场景。
- 本轮验证结果：
  - `pnpm test:unit -- src/lib/storage-url.test.ts`：4/4 通过
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过
  - 本地 production `/scripts` 截图确认当前首屏活动图片显示正常。

---

## 04-22 首页定位与 Starbucks 风格转译补记
- 用户提供 `DESIGN-starbucks.md`，要求动画先不改，其余按“业务更明确”的方向调整。
- 设计判断：
  - Starbucks 风格比 Spotify 更适合竹溪社：暖奶油底、多层绿色、pill CTA、实体卡片感，更接近“温暖社群 + 线下活动”。
  - 不能照搬 Starbucks；本轮只做“语义转译”，保留竹溪社的竹/校园/日式气质。
- 已完成：
  1. Hero 文案从抽象“连结东京校园”改为直接表达“东京华语学生线下社交 / 精选活动 / 剧本体验 / 同好匹配”。
  2. Hero CTA 改成双入口：
     - `查看精选活动` -> `/scripts`
     - `填写匹配偏好` -> `/app/matching/survey`
  3. 新增首页轻量业务证据区：
     - `src/components/landing/ActivityPreviewSection.tsx`
     - 有后台精选活动时展示 3 个活动卡；无数据时展示“剧本体验 / 同好匹配 / 周末组局”说明卡。
  4. Mission 文案从“学术成长 / 社交网络 / 融入校园”改为“精选活动 / 同好匹配 / 安心社群”。
  5. 视觉语言局部迁移 Starbucks：
     - warm cream band
     - green filled pill CTA
     - outlined pill secondary action
     - softer card shadow and 12px card radius
     - nav soft layered shadow
- 明确未改：
  - `IntroOverlay` 14 秒开场动画按用户要求暂不动。
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过
  - 本地 production 服务 + Chrome reduced-motion 截图审查：通过

---

## 04-22 首页 Hero 图替换候选已落地
- 用户提供新图：`public/images/landing/ChatGPT Image 2026年4月22日 21_45_10.png`
- 判断：适合首页 Hero，原因是左侧留白充足，右侧建筑/樱花构成视觉重心，整体更接近真实网站主视觉。
- 已转换并覆盖当前站点使用资源：
  - `public/images/landing/campus-panorama.webp`
  - 输出尺寸：`2560x1098`
  - 格式：WebP，quality 92
- 源 PNG 当前仍是未跟踪本地文件，未纳入 Git；如需保留源文件再单独决定是否提交。

---

## 04-22 Staff 头像上传与本地预设补记
- 用户希望 Staff 头像不要依赖手填外部 URL，并需要几套符合竹溪社视觉语言的头像。
- 已新增 6 个项目内置 SVG 预设头像：
  - `public/images/staff-avatars/bamboo.svg`
  - `public/images/staff-avatars/sakura.svg`
  - `public/images/staff-avatars/ink-mountain.svg`
  - `public/images/staff-avatars/campus-lantern.svg`
  - `public/images/staff-avatars/washi-wave.svg`
  - `public/images/staff-avatars/tea-garden.svg`
- 已新增后台上传 action：
  - `src/app/admin/staff/avatar-actions.ts`
  - 上传到 Supabase Storage bucket：`staff-avatars`
  - 首次上传时会自动创建 public bucket
  - 限制：JPG / PNG / WebP / SVG，最大 2MB
- 后台 `/admin/staff` 现在支持：
  - 新增 Staff 时上传头像，或选择本地预设头像
  - 编辑 Staff 时上传新头像，或改用本地预设头像
  - 不选头像时继续显示姓名首字
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过

---

## 04-22 老玩家数据库同步状态补记
- 用户追问“数据库的信息存到哪里了”：本次老玩家清洗结果**不是存到 GitHub**，而是已经写入 Supabase 新项目：
  - Supabase URL：`https://wjjhprflldvclulistcx.supabase.co`
  - Supabase project ref：`wjjhprflldvclulistcx`
  - 项目名：`zhuxishe`
  - 主数据表：`public.legacy_members`
  - 来源审计表：`public.legacy_member_sources`
- 已在远程数据库执行老玩家同步所需 schema 扩展：
  - 本地迁移文件：`supabase/migrations/036_legacy_member_sync_audit.sql`
  - 作用：扩展 `legacy_members` 字段，并新增 `legacy_member_sources` 审计表
- 已实际写库的结果（以 04-20 同步后回查为准）：
  - `legacy_members`：`119` 条
  - `legacy_member_sources`：`310` 条审计记录
  - `member_no is null` 的新增历史档案：`23` 条
  - 本轮 `manualNeeded = 0`
  - 本轮写库阻塞：`0`
- 本地可复跑链路位置：
  - `scripts/legacy-members/run.mjs`
  - `scripts/legacy-members/README.md`
  - `pnpm legacy:sync`：重新扫描 2025/2026 Word + Excel 并写入 Supabase
  - `pnpm legacy:report`：只生成报告，不写库
- 最近一次同步报告位置：
  - `output/legacy-members/2026-04-20T12-05-17-628Z/sync-report.md`
  - 报告统计：发现来源文件 `142`，zip entries `150`，Excel 结构化行 `196`，Word/PDF 结构化源 `114`，解析候选 `121`，最终入库唯一记录 `119`
- GitHub 状态：
  - 曾误推到 `zhuxishe/zhuxi-v2` 的 `codex/legacy-member-sync` 分支
  - 用户指出不是要推该项目后，已删除远端分支和本地分支
  - **没有合并到 `main`**
- 重要边界：
  - 图片/JPG/PNG 未 OCR 入结构化字段，只作为未结构化来源记录/报告说明
  - `不合格` 目录不进入主库
  - 字段决议规则：`Word > Excel`，`2026 Excel > 2025 Excel`，本次同步覆盖库内旧值，源文件无值则留空

---

## 最近完成（04-11 ~ 04-16，44 commits）

### 人格配图完整迭代（04-11，跨 2 个会话）—— **已完成**

**配图现状**：20 张 WebP 存放 `public/images/personality/`，已可用于生产。

**完整流程回顾**：
1. **v1~v5 本地 FLUX 全部失败**：用了 SDXL 的 `CheckpointLoaderSimple`，根因是工作流错误而非量化损失
2. **v6~v8 修正工作流后出图**，但 Q5_K_S 量化在手脚/面部/道具细节上仍有瑕疵
3. **质量审查（agent）发现 9 张问题**：
   - 6 张肤色不统一（肉色而非全绿）→ 加 "entire body is monochromatic green including skin"
   - 3 张风格偏离（佛像/双人/石雕）→ 加显式负面约束 "NOT a stone statue", "Only one figure"
   - 重新生成 9 张
4. **最终改用 Gemini Imagen 3 生成全部 20 张**，质量远超本地量化模型
5. **事故**：做色相转换前误从 ComfyUI 恢复旧版覆盖了 Gemini 版本，幸好 Downloads 仍有副本
6. **Pillow 选择性色相转换**：只改绿色像素（H=45~125, S>15），保留道具原色

**5 系列色相映射**（PIL HSV 0-255）：
| 系列 | hue | 色名 |
|------|-----|------|
| 热情 (E) | 7 | 赤陶红 |
| 温暖 (A) | 25 | 琥珀金棕 |
| 好奇 (O) | 130 | 青碧湖蓝 |
| 稳健 (C) | 152 | 青石灰蓝 |
| 从容 (ES) | 195 | 藤紫淡紫 |

**详细复盘**：`.claude/project-memory/docs/session-retrospectives/2026-04-11-personality-images.md`

---

### 认证链路修复（04-12，最大踩坑区）
- Google OAuth 首登要点两次 → 三轮迭代，根因是 `copyCookies`（D019）
- WebView 检测 + 邮箱注册已存在 OAuth 用户检测
- 补充信息页 TypeError → 两轮修复（DB null 覆盖默认值）（D020）
- 资料完成度误判

### 全站审查加固（04-15 ~ 04-16）
- Codex + GLM + Claude 三方交叉审查（D018）
- getSingleRelation 统一 Supabase JOIN 解包（6+ 文件）（D001）
- 错误码 i18n 翻译链 + admin error boundary（D003）
- interview-form 并发防护（D022）
- player.ts DB 错误 vs 记录不存在区分（D023）
- Vitest 54 测试 + Playwright 4 smoke + ESLint flat config
- 依赖安全 35→10（pnpm overrides）（D024）

### 小程序全功能对齐（04-16，Codex 主导）
- 21 页面与 Web 端功能对齐 + 13 项安全/Bug 修复
- Edge Function v5 + 品牌文案统一（D012）

---

## 已验证
- `pnpm typecheck` 零错误（miniprogram 子包除外）
- `pnpm test:unit` 54 tests pass
- `pnpm build` 通过
- `pnpm lint` 可运行（121 历史 error 待渐进清理）
- 20 张 WebP 配图已确认存在，风格统一（全身绿色 → 选择性色相 → 5 色系）

## 未验证
- **Vercel 线上 Google OAuth 无痕窗口首次注册** ← 最重要
- 迁移 034 推送到 Supabase
- 小程序真机测试 + 微信登录验证
- 小程序体验版内测链路（体验成员 / 二维码 / 反馈闭环）
- 剧本资源真机稳定性（偶发转圈）

## 04-16 文档同步补充
- 已新增 4 份小程序同步文档：
  - `docs/miniprogram-sync-index.md`
  - `docs/miniprogram-state-matrix.md`
  - `docs/runbooks/miniprogram-cn-infra.md`
  - `docs/runbooks/miniprogram-wechat-console.md`
- 这些文档已收口：
  - 小程序构建链路
  - 微信后台合法域名 / 体验版 / 提审前流程
  - `.com` 合规展示层与阿里云 Nginx 代理
  - `api.zhuxishe.com -> Supabase 东京` 的跨区拓扑与性能风险
- 已对账并修正文档漂移：
  - `.com` 静态页新文案已上线，不再标记为未上传
  - 人格测试结果图已接入小程序并通过构建，不再标记为“仅文件存在”
  - 品牌展示层已统一为 `zhuxishe / 个人记事本`
- 文档审查结果：
  - GLM 最终复核：无 P0/P1 级遗漏、模糊、矛盾
  - 子 agent 最终仅指出 `scp` 示例路径问题，已修复为 `deploy/com-site/...`

## 04-17 主同步文档补充
- 已新增 `docs/project-sync-audit.md`
- 该文档收口：
  - 项目总览与技术边界
  - 关键入口索引（Web / Admin / Matching / Quiz / Landing / Miniprogram）
  - 已完成事项 vs 未验证事项
  - 匹配 / 人格测试 / 首页动画的核心逻辑
  - P0 / P1 / P2 关键问题与最小下一步顺序
- 本次文档同步仅新增入口文档，不改既有 retrospective 内容

## 04-17 全项目验证与修复
- 已完成一轮以 Codex 为主、GLM 为复核的项目验证
- 本轮修复的真实问题：
  - `eslint` 错误被 `.claude/worktrees/**` 和 `packages/miniprogram/dist/**` 噪音污染
  - `AdminUserList` 首屏列表依赖客户端 `useEffect` 拉取，lint 规则与数据流不一致
  - `ScriptAccessPanel` 首屏授权列表依赖客户端初始化 effect，首屏和后续刷新职责混杂
  - `IntroOverlay` 在 render 中读取 ref，并用 effect 初始化 reduced-motion
  - `LineBindingCard`、`SurveyStatusCard` 使用 effect 派生纯展示状态
  - `packages/miniprogram/tsconfig.json` 缺 `skipLibCheck`，导致独立 `tsc -p` 被 Taro 类型库污染
  - 根 `tsconfig.json` 未包含 `.next/types/**/*.d.ts`，导致 `pnpm typecheck` 偶发卡在 `.next/types/validator.ts`
- 本轮修改文件：
  - `eslint.config.mjs`
  - `tsconfig.json`
  - `packages/miniprogram/tsconfig.json`
  - `src/components/admin/AdminUserList.tsx`
  - `src/app/admin/users/page.tsx`
  - `src/components/admin/ScriptAccessPanel.tsx`
  - `src/app/admin/scripts/[id]/page.tsx`
  - `src/components/landing/IntroOverlay.tsx`
  - `src/components/player/LineBindingCard.tsx`
  - `src/components/player/SurveyStatusCard.tsx`
- 验证结果：
  - `pnpm typecheck` 通过
  - `pnpm build` 通过
  - `pnpm exec tsc --noEmit -p packages/miniprogram/tsconfig.json` 通过
  - `pnpm --dir packages/miniprogram build:weapp` 通过
  - `pnpm lint` 现为 **0 error / 45 warnings**
  - GLM 复核：**无 P0/P1**
- 04-17 本次续接复跑确认：
  - 再次执行 `pnpm lint`，结果仍为 **0 error / 45 warnings**
  - 再次执行 `pnpm typecheck`、`pnpm test:unit`（54/54）、`pnpm build`，全部通过
  - GLM 二次复核结论未变：剩余项主要是 `next/image`、小程序 `alt`、历史 `eslint-disable` 清理，不构成功能阻塞
- 04-17 第二轮收尾修复：
  - 已将 Web 端残余 `<img>` 大范围迁移到 `next/image`
  - 已清理全部失效 `eslint-disable`，`pnpm lint` 现为 **0 warning**
  - 已确认小程序 `Image` 不支持 `alt`，因此改为在 `eslint.config.mjs` 对 `packages/miniprogram/src/**` 关闭 `jsx-a11y/alt-text`，避免伪问题与类型冲突
  - 已修复 `/admin/login` 在 `next start` 下的隐藏 500：从 `form action={asyncFn}` + `useSearchParams` 改为受控表单 `onSubmit` + `window.location.search`
  - 已新增 `src/app/icon.svg`，补齐 app icon，消除首页浏览器 `favicon` 404 噪音
  - agent 发现 `IntroOverlay` 的 `prefers-reduced-motion` 读取会造成 SSR/水合不一致，已改为 `useSyncExternalStore`
- 04-17 第二轮最终验证：
  - `pnpm lint` 通过（0 warning）
  - `pnpm typecheck` 通过
  - `pnpm test:unit` 54/54
  - `pnpm build` 通过
  - `pnpm --dir packages/miniprogram build:weapp` 通过
  - `pnpm test` 结果：45 passed / 2 skipped
  - 定向回归：`playwright test e2e/landing.spec.ts e2e/i18n.spec.ts e2e/auth.spec.ts --project=chromium` → 17 passed / 1 skipped
  - agent 最终复核：**未发现新的 P0/P1/P2**
  - GLM 最终复核：**无 P0/P1，剩余仅非阻塞 LCP 优化建议**
- 当前剩余问题：
  - 已无已确认的功能性阻塞问题
  - 剩余仅性能层建议：
    - 首页与首屏剧本图仍可继续优化 LCP（例如更明确的 `loading/priority` 策略）

### 04-17 晚间补记（以本次实际复跑为准，覆盖上面过于乐观的结论）
- 本次新增修复：
  - `next.config.ts`：补 `api.zhuxishe.com/storage/v1/object/public/**` 到 `next/image` 白名单
  - `packages/miniprogram/src/pages/scripts/index.tsx`：未登录被 `requireAuth()` 拦截时，显式 `setLoading(false)`
  - `packages/miniprogram/src/pages/scripts/detail.tsx`：缺 `id` 时结束 loading 并回到“未找到剧本”
  - `tsconfig.json`：排除 `.next/types/validator.ts`，避免 `next build` 后 `pnpm typecheck` 再次被 `routes.js` 卡住
  - `src/components/landing/IntroOverlay.tsx`：修正 skip 按钮层级/点击穿透；`prefers-reduced-motion` 现为 hydration-safe 读取
  - `playwright.config.ts`：保留 `workers: 1`、`fullyParallel: false`，但 `webServer.command` 已回退到 `next dev -p 3100`
- 本次真实验证结果：
  - `pnpm lint`：通过
  - `pnpm typecheck`：通过
  - `pnpm build`：通过
  - `pnpm test:unit`：54/54 通过
  - `pnpm exec tsc --noEmit -p packages/miniprogram/tsconfig.json`：通过
  - `pnpm --dir packages/miniprogram build:weapp`：通过
  - Playwright 关键回归子集：
    - `e2e/landing.spec.ts`
    - `e2e/i18n.spec.ts`
    - `e2e/admin-flow.spec.ts`
    - 在 `--project=chromium --workers=1` 下 **13/13 通过**
- 本次仍未闭环：
  - **完整 `pnpm test` 仍不稳定**
    - 现象：运行到中段后 `http://localhost:3100` 出现 `ERR_CONNECTION_RESET / ERR_CONNECTION_REFUSED`
    - 说明：关键路径脚本单独跑可通过，因此当前更像 **Windows + Playwright webServer + Next 本地服务** 的长跑基础设施问题，不是已确认的单页业务逻辑错误
  - 结论应以此为准：
    - **构建 / 类型 / 单测 / 小程序构建 已闭环**
    - **关键 E2E 路径已闭环**
    - **完整 E2E 套件尚未闭环**

---

## 关键文件（人格配图）
```
public/images/personality/*.webp          ← 20 张最终配图（Gemini + 选择性色相转换）
public/images/personality/PROMPTS.md      ← 20 条完整 prompt（含各系列色彩指定）
public/images/personality/color_test/     ← 色相测试样片（可清理）
src/lib/constants/personality-quiz.ts     ← ZSP-15 量表定义 + 20 个类型描述
```

**配图文件命名规则**：`{series}-{role}.webp`
- series: enthusiastic / warm / curious / steady / serene
- role 因 series 不同（不是所有 series 有所有 role）— 以 personality-quiz.ts 为准

## 关键文件（本轮新增/重改）
```
# 认证
src/app/login/callback/route.ts         ← copyCookies + resolvePlayerRoute
src/components/auth/LoginSocialSection.tsx ← 客户端 OAuth（新建）
src/lib/auth/routing.ts                 ← 纯函数分流（新建）
src/proxy.ts                            ← Supabase session 刷新（新建）

# Supabase 解包
src/lib/supabase/relations.ts           ← getSingleRelation（新建）

# 测试
vitest.config.ts / eslint.config.mjs   ← 新建
src/__tests__/*.test.ts                 ← 3 个测试文件（新建）
```

---

## 下次继续
1. **Vercel 线上 OAuth smoke**（无痕窗口 + 新 Google 账号）
2. 迁移 034 推送 + 重新生成 Supabase 类型
3. Vercel 部署上线 + 域名配置（DL: 04-30）
4. 小程序真机测试 + 合法域名
5. ESLint 历史错误渐进清理（121 个，逐步）
6. packages/shared/ 常量共享（减少 Web/小程序双份维护）
7. 人格测试结果页：确认配图在浏览器中正确展示
8. （可选）清理 `public/images/personality/color_test/` 和 `public/images/personality_backup/`

### 04-17 首页视频导出补记
- 已验证：**当前首页横版可以直接导出为独立 mp4，不依赖 App**
- 导出方式：
  - 本地 `next build`
  - 本地 `next start`
  - Playwright 录制 `1920x1080`
  - `ffmpeg` 转码为 `H.264 mp4`
- 产物：
  - `output/playwright/landing-export/zhuxishe-homepage-landscape-1920x1080.mp4`
  - 原始录制：`output/playwright/landing-export/raw/page@15a175e16f4546b09c618711d14c54db.webm`
  - 校验截图：`output/playwright/landing-export/landing-export-check.png`
- 成片参数：
  - `1920x1080`
  - `18.52s`
  - `25fps`
  - `h264`
- 说明：
  - 视频内容是“当前首页顶屏 + 开场动画 → Hero 出现”的实际运行录制，不是旧 Remotion 历史导出物

### 04-20 匹配导入导出补记
- 已完成 3 个匹配链路修复：
  - `RoundDetailClient` 只在 `round.status === "closed"` 时显示“运行匹配”，前后端状态校验对齐
  - `fetchMatchHistory()` 仅统计 `match_results.status = confirmed` 且 `match_sessions.status = confirmed` 的历史，草稿/未发布结果不再污染重复配对惩罚
  - 多人组构建改为严格维护“全组共同时间交集”，无共同时间时不再产出伪 `bestSlot`
- 已完成 Excel 导入：
  - 入口：`src/components/admin/RoundImportPanel.tsx`
  - action：`src/app/admin/matching/rounds/[id]/import-actions.ts`
  - 服务：`src/lib/matching/round-import-service.ts`
  - 解析：`src/lib/matching/round-import-parser.ts`
  - 策略：**当前轮次 submissions 全量覆盖**

### 04-20 simplify 审计补记
- 已完成冗余代码清理与匹配链收口：
  - 删除测试写入链路：`src/app/admin/matching/new/*`、`src/components/admin/MatchConfigPanel.tsx`
  - 删除 dev seed：`src/app/admin/dev/seed/*`、`src/lib/dev/fake-data.ts`
  - 删除零引用/旧遗留文件：
    - `src/components/landing/TeamSection.tsx`
    - `src/components/admin/ScriptPdfUpload.tsx`
    - `src/components/admin/MatchResultsTable.tsx`
    - `src/components/admin/MatchResultRow.tsx`
    - `src/components/ui/avatar.tsx`
    - `src/components/ui/card.tsx`
    - `src/lib/constants/personality-quiz-loader.ts`
    - `src/lib/constants/personality-quiz-ja.ts`
    - `src/lib/queries/pair-relationships.ts`
    - `src/lib/matching/index.ts`
    - `src/lib/matching/duo-helpers.ts`
    - `src/lib/matching/duo-matching.ts`
    - `src/lib/matching/multi-matching.ts`
- 已新增统一 helper：
  - `src/lib/matching/build-round-candidates.ts`
  - `src/lib/queries/cancelled-pool.ts`
- 当前 live 匹配链已统一：
  - 正式运行：`src/app/admin/matching/rounds/[id]/actions.ts`
  - 手动兼容检查 / 手动配对：`src/app/admin/matching/[id]/manual-actions.ts`
  - 取消池重匹配：`src/app/admin/matching/[id]/pool-actions.ts`
  - 三处都走 `buildRoundCandidates()`，统一 live history + import legacy history 合并逻辑
- 已补 3 个关键行为修复：
  - **旧测试 session 只读**：`src/app/admin/matching/[id]/actions.ts` 新增后端 guard，`round_id == null` 时 lock/split/restore/delete/confirm/unpublish 全部拒绝；`MatchSessionView` 只保留为第二道 UI 防线
  - **matched round 冻结**：`src/components/admin/round-detail-rules.ts` 新增 `canUpdateRoundStatus()`；`src/app/admin/matching/rounds/[id]/actions.ts` 阻止 `matched` 被手动降级，也阻止手动伪造切到 `matched`
  - **旧 session 热力图不再漂移**：`src/app/admin/matching/[id]/page.tsx` 在无 `round_id` 时不再伪造 heatmap
- 手动配对漏洞已修：
  - `ManualPairDialog` 现在只允许本轮 submission 成员进入 round session
  - 缺 submission 时后端 hard fail
  - 无共同时间时后端 hard fail
  - 旧测试 session 不允许手动配对
- 本地清理：
  - 所有未跟踪 `*.bak` 已归档到 `.local-backups/untracked-bak-2026-04-20.zip`
  - 原始 `.bak` 已从工作区删除
  - `docs/`、`output/`、图片素材、`.claude/worktrees/` 仍保留在本地，**未纳入本次提交范围**
- 本次验证结果：
  - `pnpm typecheck` 通过
  - `pnpm lint` 通过
  - `pnpm test:unit` 64/64 通过
  - `pnpm build` 通过
  - 子 agent（删除安全）：确认已删除文件无现存源码 import / 测试依赖 / 运行时入口；仅 `.next/dev` typed-routes 与 docs/worktrees 残留旧路径
  - 子 agent（匹配链复核）：确认 old session 已是后端只读、matched round 冻结生效、candidate 构建三处统一、未发现新的运行时双轨
- GLM 摘要复核：未指出有证据的 `P0/P1` 回归，剩余意见主要是“继续防范动态引用”；已通过本地静态搜索再次确认无源码残留引用

### 04-20 Excel 导入失败补记
- 已定位当前导入失败根因：
  - **不是 Google Forms 回复表结构变化**
  - 当前连接的 Supabase 库仍缺 `match_round_submissions.import_metadata` 列
  - 直接探针结果：`42703 column match_round_submissions.import_metadata does not exist`
- 已完成兼容修复：
  - `src/lib/matching/round-import-service.ts`
    - 导入前会探测 `import_metadata` 列是否存在
    - 若不存在，自动降级为**不写入 `import_metadata`**，保证 Excel 仍可导入
  - `src/lib/matching/session-export.ts`
    - 导出时同样按 schema 能力探测，缺列时不再因 `select import_metadata` 失败
  - `src/app/admin/matching/rounds/[id]/import-actions.ts`
    - 现在会把 Supabase/PostgREST 对象错误转为可读消息，不再只显示“导入失败”
  - 新增：
    - `src/lib/supabase/postgrest-error.ts`
    - `src/lib/matching/import-metadata-column.ts`
    - `src/__tests__/import-metadata-column.test.ts`
- 兼容后的实际含义：
  - **当前库未跑 035 的情况下，导入可继续使用**
  - 但由于没有 `import_metadata` 列，这次导入不会把原始第一/第二志愿、legacy history、script/activity 偏好落库
  - 一旦数据库补上 `035_match_round_import_metadata.sql`，上述元数据会自动恢复写入，无需再改代码
- 本次验证结果：
  - `pnpm typecheck` 通过
  - `pnpm test:unit` 67/67 通过
  - `pnpm lint` 通过
  - `pnpm build` 通过

### 04-20 Excel 导入数值归一化补记
- 新出现的导入报错：`invalid input syntax for type integer: "4.1"`
- 已定位根因：
  - 不是 `.xlsx` 表结构问题
  - `legacy_members.compatibility_score` 中存在小数值（如 `4.03`、`4.1`、`4.666666667`）
  - 导入时 legacy-temp 成员会把该值写入 `members.attractiveness_score`
  - 当前数据库对应列按整数约束处理，因此 `4.1` 直接报错
- 已完成修复：
  - 新增 `src/lib/matching/legacy-import-normalize.ts`
  - `round-import-service.ts` 现在会在落库前做安全归一化：
    - `compatibility_score` → 四舍五入并夹到 `0~5`
    - `session_count` → 四舍五入并保证非负整数
  - 归一化同时用于：
    - `legacy_members -> PreparedImportRow`
    - `members.attractiveness_score`
    - `member_dynamic_stats.activity_count`
- 已补测试：
  - `src/__tests__/legacy-import-normalize.test.ts`
- 本次验证结果：
  - `pnpm typecheck` 通过
  - `pnpm test:unit` 69/69 通过
  - `pnpm lint` 通过
  - `pnpm build` 通过

### 04-20 假成员数据清理补记
- 用户确认：**4/9 生成的成员是假数据**，来源是旧成员信息的随机生成，不应继续保留在当前库里
- 已识别并清理的目标：
  - `96` 个假成员
  - 识别特征：
    - `membership_type = player`
    - `email is null`
    - `created_at` 落在 `2026-04-09T15:26:12.271556+00:00 ~ 2026-04-09T15:29:34.207954+00:00`
    - `member_number = No.xxx`
  - 这批数据实际对应东京时间 `2026-04-10`
- 已同步删除的测试链路数据：
  - `match_rounds.id = 5695237d-d480-4c0a-a41f-f5e5ee22e055`
  - `round_name = test`
  - `match_sessions.id = 37258435-4ebc-4b94-a43d-2eb3539fda64`
  - `session_name = test 匹配`
  - 关联 `match_round_submissions`
  - 关联 `match_results`
  - 关联 `mutual_reviews`
- 清理原因：
  - 该测试 session 为 `confirmed`，如果保留，会继续污染真实成员的 match history / pair relation 统计
  - session 中还混入了 2 个真实成员，因此不能只删假成员本体，必须把整个测试 round/session 一起移除
- 已保留的真实成员：
  - `c9778775-b4b3-4bc0-95db-34464d89ddbc` → `yunyoumao77@gmail.com` / 李佩泽
  - `2f08f6a5-351e-4a2f-a8f6-ef53480c9560` → `yunyoumaoeel@gmail.com` / 张飞
  - 这 2 人仅删除了他们挂在 `test 匹配` 上的测试结果，本体账号仍在
- 本地备份：
  - 已写入 `.local-backups/db-fake-members-2026-04-09-backup.json`
  - 备份包含：假成员、test round、test session、submissions、results、mutual reviews
- 清理后复核：
  - `remainingFakeMembers = 0`
  - `remainingTestRound = 0`
  - `remainingTestSession = 0`
  - `remainingTestSubmissions = 0`
  - `remainingTestResults = 0`
  - `remainingTestMutualReviews = 0`
  - 规则：只支持 `.xlsx` 第一张表；一二志愿不同标准化为 `都可以`；姓名按 `当前 members -> legacy_members -> temp member` 严格唯一匹配
  - 2026-04-20 补记：导入格式已进一步收口为 **Google Forms 回复表原始导出格式**
    - 日期区结构：`1 天 = 1 列`
    - 每个日期单元格内容形如：`上午有空, 下午有空` / `全天有空`
    - **不再兼容** 旧的“`1 天 = 上午/下午/晚上/全天 多列`”清洗格式
- 已完成导入数据落库扩展：
  - migration：`supabase/migrations/035_match_round_import_metadata.sql`
  - `match_round_submissions.import_metadata jsonb` 用于保存原始一二志愿、legacy 补强、来源、warning 等
- 已完成匹配逻辑接线：
  - `submissionToCandidate()` 会优先读当前 member 资料，缺失字段再读 `import_metadata` 的 legacy 补强
  - `runRoundMatching()` / 手动匹配校验都会把 `import_metadata` 中的 legacy 历史合并进 `historyMap`
- 已完成 Excel 导出：
  - 路由：`src/app/admin/matching/[id]/export/route.ts`
  - 服务：`src/lib/matching/session-export.ts`
  - session 页新增“导出 Excel”，固定导出 `配对结果` + `未匹配名单` 两张 sheet
- 本轮新增测试：
  - `src/__tests__/matching-history.test.ts`
  - `src/__tests__/matching-multi-group.test.ts`
  - `src/__tests__/round-import-parser.test.ts`
  - `src/__tests__/round-import-resolver.test.ts`
  - `src/__tests__/matching-import-metadata.test.ts`
  - `src/__tests__/round-detail-client.test.ts`
- 本轮验证结果：
  - `pnpm lint`：通过
  - `pnpm typecheck`：通过
  - `pnpm test:unit`：通过（63 tests / 22 files）
  - `pnpm build`：通过
- 2026-04-20 格式实测：
  - 已用真实文件 `竹溪社26年4～5月第一次匹配（回复）.xlsx` 直接跑解析器
  - 结果：**20 条回复全部解析成功**
- 下次若继续：
  1. 用真实 Google Sheets 导出的 `.xlsx` 做一次后台导入 -> 运行匹配 -> 导出 Excel 的人工 smoke
  2. 迁移 `035` 上库后重新生成 Supabase 类型，减少 `legacy_members` / `import_metadata` 相关的 `any` 和断言

### 04-20 匹配详情页可见性与统计补记
- 用户在当前 session `0d720e58-2fa1-4bee-9ec8-3ae12d0abf15` 上提出 3 个问题：
  1. 可用时段只显示前 3 天并带 `+N天`，无法看全
  2. 想确认老成员资料到底用了什么信息
  3. 想审一下当前匹配结果和成员信息有没有异常
- 已确认并处理：
  - `src/components/admin/PlayerInfoPopover.tsx`
    - 可用时段改为**完整显示**，不再截断为前 3 天
    - 新增“导入来源”区块
    - 在 `import_metadata` 缺列时，按 `IMP-成员号 + 姓名命中 legacy_members` 的同规则做**现场推断**显示
  - `src/app/admin/matching/[id]/page.tsx`
    - 轮次详情页会构建 `importInfoMap`
    - 把导入来源 / legacy 补强信息附着到结果成员、取消池成员、未匹配成员 popover
  - `src/components/admin/MatchSessionView.tsx`
    - session 详情页顶部 KPI 改为按当前 `match_results` 实时推导
    - 不再直接相信已漂移的 `match_sessions.total_matched / total_unmatched`
  - `src/app/admin/matching/[id]/actions.ts`
  - `src/app/admin/matching/[id]/manual-actions.ts`
  - `src/app/admin/matching/[id]/pool-actions.ts`
    - 在拆散 / 恢复 / 手动配对 / 取消池再匹配后，自动回写 session 汇总人数
- 本次查库结论（当前这轮真实状态）：
  - 当前 round：`a558252c-8ac9-464e-a638-d0f3697b7f0a`
  - 当前 session：`0d720e58-2fa1-4bee-9ec8-3ae12d0abf15`
  - 导入后的 `20` 位成员**全部是 `IMP-...` 临时成员**
  - 其中 `8` 位按姓名命中了 `legacy_members` 并做了补强：
    - `白杨`
    - `吕嘉玥`
    - `吴璠`
    - `南以勒`
    - `常啸天`
    - `叶淑雯`
    - `朱捍华`
    - `方奥陶`
  - 当前数据库仍缺 `match_round_submissions.import_metadata` 列
    - 这意味着：**当前这轮没有保存 raw 志愿 / script-activity 偏好 / legacy history**
    - 也意味着：**legacy match history 没有并入这次算法**
    - 真正已进入算法的是导入时落库到 temp member 的这些字段：
      - `member_identity.school_name`
      - `member_identity.department`
      - `member_identity.hobby_tags`
      - `member_identity.personality_self_tags`
      - `member_interests.scenario_mode_pref`
      - `member_dynamic_stats.activity_count`
      - `members.attractiveness_score`
- 本次发现的实际异常：
  - session 汇总值原来漂移：
    - 库里原值：`total_matched = 16`, `total_unmatched = 4`
    - 按当前活跃结果真实计算应为：`18` 人已匹配、`2` 人未匹配
    - 已直接回写数据库修正当前 session
  - `rank = 999` 的手动配对仍存在：
    - 这是当前设计（手动插入结果固定 `999`）
    - 其中一组 `total_score = 0` 说明它是强制手动配对，不是自动算法高分结果
- 本次新增测试：
  - `src/__tests__/player-info-format.test.ts`
  - `src/__tests__/import-display.test.ts`
  - `src/__tests__/session-summary.test.ts`
- 本次验证结果：
  - `pnpm test:unit`：72/72 通过
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm build`：通过
  - 浏览器最小验收（本地 `next dev` + Playwright 脚本）：
    - `导入来源` 已可见
    - `04-21 晚上` 与更后面的 `04-28 晚上` 同时可见，说明时段不再截断
    - 顶部 KPI 已显示 `18 人已匹配 / 2 人未匹配`

### 04-20 老成员手动匹配补记
- 用户要求调整 Excel 导入链路：
  - **老成员不再自动补全**
  - 改为管理员先看导入预览，再逐行手动指定要挂到哪个 `legacy_members` 记录
  - 目标是允许处理 Excel 名字错字/别名场景
- 已完成实现：
  - `src/app/admin/matching/rounds/[id]/import-actions.ts`
    - 新增 `previewRoundExcel()`
    - `importRoundExcel()` 现支持 `legacyOverrides` JSON
  - `src/lib/matching/round-import-preview.ts`
    - 解析 `.xlsx` 后返回预览行 + 全部老成员选项
  - `src/lib/matching/round-import-context.ts`
    - 收口 round / current members / legacy members / existing submissions 载入
  - `src/lib/matching/round-import-resolver.ts`
    - 当前正式成员：仍按精确姓名自动复用
    - 老成员：**默认不自动套用**
    - 只有管理员手动指定 `legacy_id` 才会走 `legacy-temp`
  - `src/components/admin/RoundImportPanel.tsx`
    - 导入改为两步：`解析预览 -> 手动指定老成员 -> 确认导入`
  - 新增 UI：
    - `src/components/admin/RoundImportPreview.tsx`
    - `src/components/admin/LegacyMemberSearchSelect.tsx`
- 当前实际规则（以本次代码为准）：
  - `current members`：精确姓名命中时自动复用
  - `legacy members`：不再自动命中，即使同名也只作为提示显示
  - 管理员可以在预览列表里为任意行手动指定 `legacy_members`
  - 未指定的行继续按普通 `temp member` 导入
- 已补测试：
  - `src/__tests__/round-import-resolver.test.ts`
    - 覆盖“同名 legacy 不自动套用”
    - 覆盖“手动 override 后才走 legacy-temp”
    - 覆盖“预览阶段只给 legacy hint，不自动绑定”
- 本次验证结果：
  - `pnpm lint`：通过
  - `pnpm typecheck`：通过
  - `pnpm test:unit`：75/75 通过
  - `pnpm build`：通过
- 当前限制：
  - 数据库若仍未上 `035_match_round_import_metadata.sql`，手动指定的 legacy 来源不会完整落在 `import_metadata`
  - 这不影响匹配算法和临时成员补强本身，但会影响后续“导入来源”回显的完整性
  - 一旦 `035` 上库，手动指定来源会完整可追踪，无需再改逻辑

### 04-20 导入覆盖与性别说明补记
- 用户追加澄清：
  - 所谓“老成员”指 `legacy_members` 里的那 96 条历史记录
  - 这些记录本身有 `gender` 字段
  - Excel 回复表**没有“成员本人的性别”字段**，只有“希望匹配对象的性别倾向”
- 基于这个澄清，本次又做了两处修正：
  1. `RoundImportPreview` / `LegacyMemberSearchSelect`
     - 老成员候选现在显示：`姓名 + 性别 + 学校 + 学部`
     - 预览区新增明确说明：
       - 只有手动绑定到老成员，系统才会带入该老成员的男女信息
       - 没绑定的行会按 `other/未知` 导入，性别偏好匹配会变弱
  2. `round-import-service.ts`
     - 现在重新导入同一轮时，会把该轮旧的 `IMP-<round>-*` 临时成员一并覆盖
     - 也就是：**不是只覆盖 submissions，而是连这轮旧临时成员档案一起替换**
     - 实现方式不是粗暴删库：
       - 先备份该轮旧 temp members 及其 `member_identity / member_interests / member_dynamic_stats`
       - 新导入流程出错时会尝试恢复旧 temp members + 旧 submissions
- 当前结论（非常重要）：
  - 系统**没有**用性别去“自动匹配老成员”
  - 之前的自动逻辑仅依赖姓名规范化
  - 现在老成员已改为人工指定，因此后续是否带入男女信息，由管理员手动决定
- 本次补改后验证结果：
  - `pnpm typecheck`：通过
  - `pnpm test:unit`：75/75 通过
  - `pnpm lint`：通过
  - `pnpm build`：通过

### 04-20 导入预览手动本人性别补记
- 用户继续要求：
  - 在“解析预览”里，**未绑定老成员**的行必须允许管理员手动选择“本人性别”
  - 目标是补上 Excel 缺失的“参与者自报性别”字段，避免 temp member 一律落成 `other`
- 已完成实现：
  - `src/components/admin/RoundImportPanel.tsx`
    - 新增 `genderOverrides`
    - 导入前会统计“未绑定老成员且未选本人性别”的行数
    - 这类行存在时，“确认导入”按钮直接禁用
  - `src/components/admin/RoundImportPreview.tsx`
    - 每行现在明确二选一：
      - 绑定老成员
      - 手动选择本人性别
    - 未选完时会显示红色提示
  - 新增 `src/components/admin/ImportSelfGenderSelect.tsx`
    - 提供 `男 / 女 / 其他 / 不确定`
  - `src/app/admin/matching/rounds/[id]/import-actions.ts`
    - 新增 `genderOverrides` 解析
  - `src/lib/matching/round-import-resolver.ts`
    - `temp` 行会携带 `manualGender`
    - 同步写入 `importMetadata.manual_self_gender`
  - `src/lib/matching/round-import-service.ts`
    - 对 `temp` 行新增后端 hard fail：
      - 未绑定老成员时，若没选本人性别，直接报错拒绝导入
    - 创建 temp member 时，`member_identity.gender` 现在优先用手动选择值
- 当前规则（以本次代码为准）：
  - `current member` 自动命中：不需要手动选本人性别
  - 手动绑定 `legacy_members`：直接沿用该老成员性别
  - 未绑定老成员：**必须手动选本人性别**
- 本次验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：76/76 通过
  - `pnpm build`：通过

### 04-20 匹配页跳转逻辑补记
- 用户指出“匹配页面跳转有点问题”，本次已确认并收口 3 个真实问题：
  1. `RoundCreateForm` 的“取消”原来使用 `router.back()`  
     - 直接打开 `/admin/matching/rounds/new` 时会退回浏览器历史，目标不确定，甚至可能离开管理后台
  2. 创建轮次成功后原来使用 `router.push()`  
     - 会把创建页保留在历史栈里，回退体验不稳定
  3. `MatchSessionView` 删除 session 后原来使用 `router.push()`  
     - 已删除的 session 详情页会残留在历史栈，浏览器 Back 可能回到无效页
- 已完成修改：
  - `src/components/admin/RoundCreateForm.tsx`
    - 创建成功：`router.replace('/admin/matching/rounds/:id')`
    - 取消：固定跳到 `/admin/matching/rounds`
  - `src/app/admin/matching/rounds/new/page.tsx`
    - 新增显式“返回轮次列表”
  - `src/components/admin/MatchSessionView.tsx`
    - 删除 session 成功后改为 `router.replace(target)`
  - `src/app/admin/matching/[id]/page.tsx`
    - 新增显式返回入口：
      - 有 `round_id`：返回对应轮次详情
      - 无 `round_id`：返回匹配管理主页
- 当前结论：
  - 轮次创建页不再依赖浏览器历史
  - 删除 session 后不会再把已删除页面留在回退栈里
  - 匹配详情页与轮次页之间现在有明确导航链
- 本次验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：76/76 通过
  - `pnpm build`：通过

### 04-20 导入预览排除 IMP 临时成员补记
- 用户发现一个真实问题：
  - “当前正式成员自动复用”会把上一轮 Excel 导入创建的 `IMP-...` 临时成员也识别成“当前成员”
  - 结果是这些旧 temp member 会抢先命中，导致本轮无法继续手动匹配 `legacy_members`
- 已完成修复：
  - `src/lib/matching/round-import-context.ts`
    - `fetchCurrentImportMembers()` 现在显式过滤 `member_number` 以 `IMP-` 开头的成员
  - `src/lib/matching/round-import-resolver.ts`
    - `buildCurrentMatches()` 再加一道防线，即使未来有人把 `IMP-...` 传进来也不会被当成可复用 current member
- 当前规则（以本次代码为准）：
  - 自动复用 `current member` 只针对真实正式成员
  - 上一轮 Excel 导入产生的 `IMP-...` 临时成员**不再参与自动复用**
  - 因此这些名字会重新进入“老成员手动匹配 / 本人性别手动选择”分支
- 已补测试：
  - `src/__tests__/round-import-resolver.test.ts`
    - 新增用例：`IMP-...` 当前成员不会被识别为可复用 current member
- 本次验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：77/77 通过
  - `pnpm build`：通过

### 04-20 匹配页结构与返回链简化补记
- 用户明确指出当前匹配区跳转逻辑仍然混乱，主要问题是：
  1. `/admin/matching` 与 `/admin/matching/rounds` 都在承担“轮次列表页”，职责重复
  2. 轮次详情、创建页、session 详情页的返回入口不统一
  3. 用户会在“匹配管理 / 轮次列表 / 轮次详情 / session 详情”之间来回跳，心智负担过高
- 本次已做结构收口：
  - `src/app/admin/matching/page.tsx`
    - 现在直接展示**全部轮次**
    - 删除“只显示前 5 个轮次 + 查看全部”这一层跳转
  - `src/app/admin/matching/rounds/page.tsx`
    - 改为直接 `redirect("/admin/matching")`
    - 保留旧路径兼容，但不再作为独立列表页存在
  - `src/app/admin/matching/rounds/[id]/page.tsx`
    - 返回入口统一改成“返回匹配管理”
  - `src/app/admin/matching/rounds/new/page.tsx`
    - 返回入口统一改成“返回匹配管理”
  - `src/components/admin/RoundCreateForm.tsx`
    - 取消按钮改成固定跳 `/admin/matching`
    - 创建成功后继续 `replace()` 到轮次详情，避免把创建页留在历史栈
- 当前跳转主链（以本次代码为准）：
  - `匹配管理 (/admin/matching)` = 唯一列表页
  - `轮次详情 (/admin/matching/rounds/[id])` ← 从匹配管理进入，返回也回匹配管理
  - `匹配详情 (/admin/matching/[id])` ← 从轮次运行匹配进入，有显式返回
  - `/admin/matching/rounds` 仅作为旧路径兼容，已不承担独立页面职责
- 本次验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：77/77 通过
  - `pnpm build`：通过

### 04-20 老成员搜索下拉显示层级补记
- 用户在轮次导入预览页截图指出：老成员搜索框展开时，显示层级异常，视觉上会被下面的问卷列表“串出来/盖住”
- 已定位为 UI 层级与定位写法不一致：
  - `LegacyMemberSearchSelect` 的下拉层没有像现有 `SchoolSearchSelect` / `MajorSearchSelect` 那样明确使用 `top-full left-0 right-0`
  - 导入预览块也没有显式抬高 stacking context
- 已完成修复：
  - `src/components/admin/LegacyMemberSearchSelect.tsx`
    - 外层改为 `relative isolate`
    - 下拉层改为 `absolute top-full left-0 right-0 z-[70]`
  - `src/components/admin/RoundImportPanel.tsx`
    - 导入面板改为 `relative z-10`
  - `src/components/admin/RoundImportPreview.tsx`
    - 预览块改为 `relative z-10`
  - `src/components/admin/RoundDetailClient.tsx`
    - 问卷列表区显式标记 `relative z-0`
- 当前结论：
  - 老成员搜索下拉现在使用与项目内其它搜索框一致的定位方式
  - 即使下面还有问卷列表，导入预览区也会在视觉层级上压住后面的内容
- 本次验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：77/77 通过
  - `pnpm build`：通过

### 04-20 依赖漏洞修复补记
- 本轮按既定顺序完成了依赖安全修复的前 3 步：
  1. **Web Excel 链路弃用 `xlsx`，改用 `exceljs`**
     - `src/lib/matching/round-import-parser.ts`
     - `src/lib/matching/session-export.ts`
     - `src/__tests__/round-import-parser.test.ts`
     - 当前 `.xlsx` 导入 / 导出都已基于 `exceljs`
  2. **根 `pnpm.overrides` 升级 `follow-redirects`**
     - `package.json`: `follow-redirects >=1.16.0`
  3. **小程序工具链升级**
     - `packages/miniprogram/package.json`
     - `@tarojs/*`: `4.1.11 -> 4.2.0`
     - `babel-preset-taro`: `4.1.11 -> 4.2.0`
     - `webpack`: `5.98.0 -> 5.106.2`
- 小程序升级后的兼容修复：
  - `packages/miniprogram/config/index.ts`
    - 新增 `mini.webpackChain(chain) { chain.plugins.delete("webpackbar") }`
    - 原因：`@tarojs/webpack5-runner 4.2.0` 自带的 `webpackbar` 进度插件参数已不兼容 `webpack 5.106.2`
    - 影响：仅去掉终端 fancy progress，不影响构建产物
- 进一步通过 override 收口的传递依赖：
  - `package.json`
    - `esbuild >=0.25.0`
    - `webpack-dev-server >=5.2.1`
- 当前 audit 结果（以本地 `pnpm audit --json` 为准）：
  - 已清除：
    - `xlsx`
    - `follow-redirects`
    - `esbuild`
    - `webpack-dev-server`
    - `webpack`
  - 当前仅剩 **2 个高危 advisory**
    - `packages__miniprogram>@tarojs/cli>download-git-repo>git-clone`
    - `packages__miniprogram>@tarojs/webpack5-runner>html-minifier`
  - 这 2 项在当前 Taro 4.2.0 依赖链中**没有可用 patched version**
  - 2026-04-20 二次确认（带上游版本探测）：
    - `pnpm view @tarojs/cli version` -> `4.2.0`
    - `pnpm view @tarojs/webpack5-runner version` -> `4.2.0`
    - `pnpm view download-git-repo version dependencies` -> 最新 `3.0.2` 仍依赖 `git-clone ^0.1.0`
    - `pnpm view html-minifier version` -> 最新仍是 `4.0.0`
  - 结论：
    - 当前剩余 2 个高危是 **Taro 上游未修复依赖**
    - 在不 fork / patch-package 上游包的前提下，本仓库已无法继续通过正常升级清除
    - 其中：
      - `git-clone` 位于 `@tarojs/cli` 的下载脚手架链路，属于 dev/tooling 依赖
      - `html-minifier` 位于 `@tarojs/webpack5-runner` 构建链，属于构建依赖
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：77/77 通过
  - `pnpm build`：通过
  - `pnpm --dir packages/miniprogram build:weapp`：通过

### 04-20 匹配历史与候选人构建补记
- 本轮根据外部审计意见，确认并修复了 3 个真实问题：
  1. `src/lib/queries/match-history.ts`
     - 之前只统计 `member_a_id/member_b_id`
     - 多人组历史写在 `group_members` 中，会被漏算
     - 现已改为：
       - 查询 `id/member_a_id/member_b_id/group_members`
       - 过滤条件同时覆盖 `group_members`
       - 按 `match_results.id` 去重
       - 多人组按无向两两关系写回 history map
  2. `src/components/admin/ManualPairDialog.tsx`
     - 之前弹窗只在首次 mount 时读取 `preselectedA`
     - 现已改为在 `MatchSessionView` 按 `open + preselectedA` 重新挂载对话框
     - 这样从未匹配诊断入口再次打开时，会稳定带入当前预选成员，不再残留上一次状态
  3. `src/lib/matching/adapter-submission.ts`
     - 之前未统一解包 Supabase nested relation
     - 现已改为使用 `getSingleRelation()` 解包：
       - `member_identity`
       - `member_interests`
       - `member_personality`
       - `member_dynamic_stats`
       - `member_boundaries`
       - `member_language`
       - `personality_quiz_results`
- 本轮测试补充：
  - `src/__tests__/matching-history.test.ts`
    - 新增多人组历史统计与按 `id` 去重覆盖
  - `src/__tests__/matching-import-metadata.test.ts`
    - 新增 array-shaped relation 解包覆盖
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过
  - 本地生产服务 + Playwright DOM 冒烟：通过
    - 首页 CTA href = `#featured-activities`
    - 首页“精选活动”可见
    - `/login` “返回首页”可见

### 04-22 Staff 远程数据库缺表补记
- 用户反馈后台 Staff 显示异常后，已确认远程 Supabase 缺少 `public.staff_profiles`：
  - 查询结果：`PGRST205 Could not find the table 'public.staff_profiles' in the schema cache`
- 当前环境只有 Supabase URL / anon key / service role key，没有 Supabase Access Token 或 Postgres connection string：
  - `npx supabase projects list` 返回 Unauthorized
  - 因此本机无法直接替远程库执行 migration
- 已补防崩溃处理：
  - `src/lib/queries/staff.ts`
    - 管理端查询遇到缺表时返回 `setupRequired=true`
  - `src/app/admin/staff/page.tsx`
    - 缺表时显示“数据库未更新，请应用 036_staff_profiles.sql”的提示
  - `src/app/admin/staff/actions.ts`
    - 缺表时返回可读错误，不再只显示“操作失败”
- 仍需人工/有权限环境执行：
  - `supabase/migrations/036_staff_profiles.sql`
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm build`：通过

### 04-22 Staff 远程数据库迁移已执行
- 用户提供 Supabase Postgres 直连信息后，已对远程项目 `wjjhprflldvclulistcx` 执行 `036_staff_profiles.sql` 的等价单语句迁移：
  - `CREATE TABLE IF NOT EXISTS public.staff_profiles`
  - `staff_profiles_updated_at` trigger
  - RLS enable
  - `anyone_read_published_staff` policy
  - `admin_all_staff` policy
  - `idx_staff_profiles_published_order` index
  - `NOTIFY pgrst, 'reload schema'`
- 远程验证：
  - Supabase API 查询 `staff_profiles` 成功
  - 当前 count = `0`
  - error = `null`
- 后台 `/admin/staff` 现在应显示空状态而不是“数据库未更新”或 500。

### 04-22 首页图与精选活动独立页补记
- 用户认为原首页校园图分辨率低且观感不佳，已替换为新生成的半写实日式校园全景图：
  - 生成图原始位置保留在 `C:\Users\yunyo\.codex\generated_images\019d9627-eb5d-7ba1-9a97-1c63a15253ea`
  - 项目使用图：`public/images/landing/campus-panorama.webp`
  - 输出尺寸：`2560x1098`
- “精选活动/剧本库”不再放在首页滚动区：
  - 首页 `src/app/page.tsx` 已移除 `ScriptsSection`
  - 新增公开页面：`src/app/scripts/page.tsx`
  - `LandingNav` 中“精选活动”跳 `/scripts`
  - Hero “探索热门活动”按钮跳 `/scripts`
- 仍然复用后台精选逻辑：
  - 后台剧本详情/编辑页控制 `scripts.is_featured`
  - `/scripts` 页面只展示 `is_published=true && is_featured=true` 的剧本/活动
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm build`：通过
  - 本地生产服务 + Playwright DOM 冒烟：通过
    - 首页 Hero CTA href = `/scripts`
    - 首页 nav “精选活动” href = `/scripts`
    - 首页 `#featured-activities` 数量 = `0`
    - `/scripts` 页面“精选活动”标题可见
  - `pnpm --dir packages/miniprogram build:weapp`：通过

### 04-22 首页 / App 导航 / Staff / 精选活动补记
- 本轮完成用户指定的首页与玩家区体验修复：
  1. 登录页、注册成功页、待审核/拒绝页、入会资料表单页新增“返回首页”入口。
  2. 玩家区 `/app/**` 新增顶部 header，左上角竹溪社 logo 指向 `/`。
  3. 玩家资料页退出按钮补 `type="submit"`，`signOut()` 后改为跳回首页 `/`。
  4. 字体从本地系统回退为主的栈改为 `Noto Sans SC / Noto Serif SC` 受控变量，降低 Mac/Windows 中文与日文行高漂移。
  5. 新增 `staff_profiles` 表、查询、后台 `/admin/staff`，首页关于我们区域接入 Staff 展示。
  6. 首页“剧本库”改为“精选活动”，`fetchLandingScripts()` 改为读取 `is_published=true && is_featured=true`。
  7. 后台剧本详情与编辑页可切换 `scripts.is_featured`，列表展示“首页精选”状态。
  8. Hero CTA 指向精选活动区块，FAQ 答案区域去掉缩进，Hero 改用本地校园全景图资源。
- 关键新增/修改入口：
  - `src/components/auth/HomeLink.tsx`
  - `src/components/player/PlayerTopHeader.tsx`
  - `src/app/admin/staff/*`
  - `src/lib/queries/staff.ts`
  - `supabase/migrations/036_staff_profiles.sql`
  - `src/components/landing/StaffSection.tsx`
  - `src/lib/queries/scripts.ts`
- 本轮验证结果：
  - `pnpm typecheck`：通过
  - `pnpm lint`：通过
  - `pnpm test:unit`：78/78 通过
  - `pnpm build`：通过
