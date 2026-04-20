# 会话交接 — 2026-04-16 （人格配图完成 + 文档整理）

## 当前状态
- **main 分支** `4aee24f`，已 push，Vercel 自动部署
- Supabase 东京 (wjjhprflldvclulistcx)，迁移 001-034（034 本地就绪但未 push）
- Edge Function `wechat-auth` v5（含孤儿用户容错）
- Vercel: zhuxi-v2.vercel.app
- 安全漏洞：35 → 10（0 critical，剩余为 Taro 间接依赖/devDeps）

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
