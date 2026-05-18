# 会话交接 — 2026-04-23 App / 后台 UI 重设计概念稿

## 2026-05-16 公开官网按玩家视角移动端视觉稿重做
- 用户提供 4 张移动端视觉稿，要求公开官网完全按图片方向改：手机首页不再依赖长滚动讲完整故事，而是用模块入口跳转到独立页面。
- 已完成：
  - 首页 `/` 改为图 1 风格：竹溪社 logo + 汉字主标题、特征胶囊、活动照片、2x2 入口卡片、底部信任点。
  - `/organization` 改为图 2 风格：关于我们、理念、活动类型、对比说明、团队介绍、小红书/二维码区。
  - `/scripts` 改为图 3 风格：活动介绍页，展示“大型活动”和“社交剧本类”两张大图入口卡。
  - 新增 `/join`，按图 4 做四步加入流程、安心说明和二维码 CTA。
  - 新增 `/faq`，让首页“常见问题”入口跳到独立页面。
  - 更新 `LandingNav` / `LandingFooter` 为截图式移动端 logo + 圆形菜单，并补 `navHome` 文案。
  - 从用户提供的 PNG 中裁切生成公开页可用图片素材，放在 `public/images/landing/mobile-redesign/`。
  - 新增 `src/lib/landing-copy.ts`，集中放新版公开页中日文文案。
- 验证：
  - 所有新增/修改源码文件均 < 150 行。
  - `node JSON.parse src/messages/zh.json + ja.json`：通过。
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm build`：通过，确认 `/join`、`/faq` 出现在 route 列表。
  - 本地生产服务 `http://localhost:3000` 已启动；`/`、`/organization`、`/scripts`、`/join`、`/faq` 均返回 200。
  - Playwright 手机宽度截图已生成：`output/playwright/landing-home.png`、`landing-about.png`、`landing-scripts.png`、`landing-join.png`、`landing-faq.png`。
- 注意：
  - 2026-05-18 已将所有公开页引用的截图裁切照片替换为生图模型生成图片，并压缩为 WebP。
  - 已移除截图裁切二维码和信封图；正式二维码未提供前，页面改为邮箱/联系管理员 CTA，避免上线不可扫的假二维码。
  - 2026-05-18 根据用户标注，首页删除顶部“大学生限定/真实同频”等胶囊和底部口号/信任点，新增代码渲染的“社员学校分布”圆环图模块；数据来自用户提供的 `竹溪社社员情况统计5月16日(1)(1).docx`，按总社员 135、学校 29 所统计，不直接使用 AI 图里不闭合的百分比。
  - 2026-05-18 用户确认公开邮箱为 `zhuxishe@gmail.com`；公开页联系邮箱已统一。用户提供二维码 `D:\OneDrive\7_竹溪社\竹溪社app\吴\微信图片_20260518214126_622_138.png`，已作为 PNG 原图接入 `/join` 和 `/organization` 联系区。
  - 用户提供 14 张真实活动照片，本轮只把已贴表情或看不清正脸的安全子集压缩成 WebP 替换公开页假图，清晰正脸图暂不进入公网，待表情包遮脸后再补。
  - 2026-05-18 新增本地手动遮脸工具 `output/activity-face-cover/face-cover-tool.html`：内嵌 16 个表情和 14 张活动照片草稿，支持多图导入、拖拽贴纸、缩放、旋转、删除、替换表情款式、锁比例裁剪、导出当前/全部和标注 JSON；已用 Playwright 验证 `file://` 本地打开、14 张草稿载入、16 个表情加载、PNG 导出。注意该 HTML 内嵌原始照片，只作为本地工具使用，不要直接发到公网。
  - 2026-05-18 用户在 `D:\OneDrive\7_竹溪社\竹溪社app\吴\活动图片` 导出 14 张 `*-covered.png` 成品；官网已用这些遮脸成品替换 `mobile-redesign` 下所有 AI 人物/活动照片，并按用户要求排除第 5/6/7 张重复图。
  - `/scripts` 现在更接近“活动类型介绍”而不是原来的数据库精选活动列表；公开活动详情 `/scripts/[id]` 仍保留。
  - 2026-05-19 `/scripts` 增加公开剧本库预览，可看到已发布剧本并进入 `/scripts/[id]` 公开详情；活动卡改为页内剧本库锚点。
  - 2026-05-19 `/reviews` 使用已遮脸活动照片做静态首屏活动回顾；`/organization` 照片墙移除与头图重复的照片；公开页中文/日文文案整体压短，并减少“真实/不用/不是”等自证式表达。
  - 2026-05-19 验证：`pnpm typecheck`、`pnpm lint`、`pnpm build` 均通过；本地生产服务 `http://localhost:3002` 截图检查 `/scripts`、`/reviews`、`/organization` 返回 200，`/scripts` 无 `/login` 链接且有 8 个公开详情链接。
  - 2026-05-19 二次调整 `/scripts`：按 frontend-design + GLM 建议，把大型活动改为同级照片网格，不写具体活动名；社交剧本入口改为独立页 `/scripts/library`，该页展示公开剧本库并继续链接 `/scripts/[id]` 详情。
  - 2026-05-19 验证：`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；本地生产服务截图检查 `/scripts`、`/scripts/library` 返回 200，社交剧本入口 href 为 `/scripts/library`，活动介绍页无具体活动名和自证式文案，剧本库无 `/login` 链接。
  - 本地还有此前遗留未追踪文件，提交时需要只 stage 本轮相关文件。

## 2026-05-15 面试前信息表 ON CONFLICT 报错修复
- 用户反馈：未注册/新用户提交 `/app/interview-form` 最后一步时报错 `there is no unique or exclusion constraint matching the ON CONFLICT specification`。
- 根因：
  - `src/app/app/interview-form/actions.ts` 里 `members.upsert(..., { onConflict: "user_id" })` 需要数据库存在可被 `ON CONFLICT(user_id)` 精确匹配的普通唯一索引/约束。
  - 远程库原本只有 `idx_members_user_id ON public.members(user_id) WHERE user_id IS NOT NULL`，这是 partial unique index；PostgREST/Supabase upsert 不能指定 partial index predicate，因此不能匹配该冲突目标。
  - `member_identity.member_id` 已有普通唯一约束，截图中的错误不是 `member_identity` 造成的。
- 已修复：
  - 新增 migration：`supabase/migrations/038_members_user_id_full_unique.sql`。
  - 已在远程 Supabase 执行：`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_id_full ON public.members(user_id);`
  - 保留旧 partial index，不做破坏性删除；PostgreSQL 普通 unique index 仍允许多条 `NULL user_id`，不影响 legacy/import/temp member。
- 已验证：
  - 远程库同时存在 `idx_members_user_id` 与 `idx_members_user_id_full`。
  - `members.user_id` 当前无重复非空值。
  - DB 级烟测 `INSERT ... ON CONFLICT(user_id) DO NOTHING` 已通过，返回 `INSERT 0 0`，没有留下测试数据。
  - `pnpm typecheck`、`pnpm lint`、`pnpm test:unit`、`pnpm build` 均通过。
- 是否最近动了数据库：
  - 最近确实有远程 DB 变更：`037_past_event_reviews.sql` 用于往期回顾页；更早还有 staff / legacy / quiz 等表。
  - 这些变更没有改 `members.user_id` 或 `member_identity.member_id`。
  - 本次问题是历史 schema 与现有 Supabase upsert 写法不闭合，最近的前端首页/公开页修改只是让用户实际走到了这个提交路径。

## 2026-05-15 ON CONFLICT 同类问题复查 + 后台成员编辑保存修复
- 复查范围：
  - 搜索 `src/` 与 `supabase/migrations/` 内所有 `upsert/onConflict/ON CONFLICT`。
  - 对照远程 Supabase `pg_index`，确认所有冲突目标是否存在非 partial 的唯一索引/约束。
  - 用逐条 `EXPLAIN INSERT ... ON CONFLICT ... DO NOTHING` 做无写入烟测。
- 结论：
  - 当前代码里所有 `onConflict` 目标均已具备可匹配的普通唯一索引/约束。
  - 通过烟测的目标包括：`members(user_id)`、各成员 1:1 表 `member_id`、`interview_evaluations(member_id,interviewer_id)`、`script_play_records(script_id,member_id)`、`match_round_submissions(round_id,member_id)`、`member_dynamic_stats(member_id)`。
  - `members.email`、`members.line_user_id` 仍是 partial unique index，但当前代码没有用它们做 `onConflict`，暂不构成同类运行时问题。
- 顺手修复：
  - 发现 `src/app/admin/members/[id]/edit/actions.ts` 的字段白名单和当前编辑组件/远程列名漂移。
  - 表现：后台成员编辑页部分字段可编辑但保存后不落库，例如 `degree_level`、`course_language`、`enrollment_year`、兴趣偏好若干字段、性格评分若干字段、`boundary_notes` 等。
  - 已把白名单调整为和当前组件 + 远程 schema 对齐，并移除不存在/旧字段：`degree`、`native_language`、`other_languages`、`conflict_style`、`social_energy_level`、`special_needs`、`notes`。
- 验证：
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过。

## 2026-05-13 官网首页第一轮可用性修复
- 用户给出官网首页 6 条优化建议：四个入口可点击、右下角动画可跳过、精选活动卡片可点、Hero 文案更直接、补联系方式、后续用活动照片增强社团活力。
- 本轮先做不依赖新素材/新表结构的小闭环：
  - 首页 Hero 四个方块改成可点击入口：精选活动、往期回顾、同校扩圈、匹配找搭子。
  - Hero 主文案改得更直接：强调“东京学生的线下扩圈活动社团”。
  - 新增首页联系区 `LandingContactSection`，目前使用 `contact@zhuxishe.com`，社媒链接待用户补充。
  - 导航和 Footer 增加“联系我们”入口。
  - 右下角千纸鹤动画弹层新增播放中“跳过动画”按钮。
  - 精选活动页卡片改为可点击，新增公开活动详情页 `/scripts/[id]`。
  - 公开详情页只展示封面、简介、人数/时长/地点/预算和标签；不公开 `scripts.page_images`，因为该字段实际可能是剧本页/内部资料，不等于公开活动现场照片。
  - 详情页“活动照片”区域先显示安全占位并引导到 `/reviews`。
- 验证：
  - `messages zh/ja JSON`：通过。
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过，确认 `/scripts/[id]` 出现在 build route 列表。
  - Playwright 生产服务截图检查：`/`、`/scripts`、`/scripts/[id]` 可渲染；动画弹层跳过按钮可见。
- 后续需要用户补充：
  - 官网公开社媒链接：LINE、Instagram、小红书等。
  - 每个精选活动可公开展示的现场照片；当前不能用 `page_images` 替代。
  - 如果要做第二轮大改，需要提供 3-6 张高质量活动现场/互动/合照图，用于照片主导 Hero。

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
- 注意：
  - `supabase db push --dry-run` 因远端 migration history 和本地编号体系不一致未使用；本轮只逐条执行 `037` 的 SQL，没有 repair 迁移历史。
  - 远端已确认 `public.past_event_reviews` 存在，RLS policy 数量为 2。
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

## 2026-04-29 玩家 App 启动动画行为修正
- 用户反馈：启动动画在用户登录成功后立刻出现，影响登录后的首个操作流程。
- 已调整：
  - `AppLaunchSplash` 只在独立 PWA / iOS standalone 模式下考虑播放，普通浏览器进入 `/app` 不再播放。
  - 新增 `src/lib/app-launch-splash.ts` 统一管理 splash sessionStorage key 与短期 cookie。
  - 邮箱登录成功、LINE 登录成功时写入 `zhuxi:app-launch-splash-skip-once`，跳到 `/app` 后跳过一次。
  - Google/OAuth `/login/callback` 成功后写入 60 秒短期 cookie `zhuxi_app_splash_skip_once`，让回调跳到 `/app` 后也跳过一次。
- 验证：
  - `pnpm typecheck`：通过。
  - `pnpm lint`：通过。
  - `pnpm test:unit`：78/78 通过。
  - `pnpm build`：通过。
- 未覆盖：
  - 需要线上真实 PWA 登录流程确认：登录后不播；关闭 PWA 后重新打开才按 session 规则播放。

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
