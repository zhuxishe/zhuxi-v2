# Session Handoff — 2026-04-14 12:00
## Completed
- `deploy/com-site/index.html` — `.com` 首页标题改为 `zhuxishe`，说明改为“个人记事本”
- `deploy/com-site/privacy.html` — 隐私页将“个人页面”措辞改为“个人记事本”
- `deploy/com-site/terms.html` — 协议页将“个人页面”措辞改为“个人记事本”
- `packages/miniprogram/src/app.config.ts` — 小程序全局导航标题改为 `zhuxishe`
- `packages/miniprogram/src/pages/index/index.config.ts` — 首页导航标题改为 `zhuxishe`
- `packages/miniprogram/src/pages/index/index.tsx` — 首页品牌标题改为 `zhuxishe`，副标题改为“个人记事本”
- `packages/miniprogram/src/lib/quiz-data.ts` — 人格测试题干中的“竹溪社”统一改为 `zhuxishe`
## Verified
- 使用 PowerShell 检索确认当前展示层源码中已不再残留首页/静态页的“竹溪社 / 剧本杀社团 / 个人页面”旧文案（保留 `.bak` 备份文件中的历史文案）
- 运行 `pnpm build:weapp` 通过
## Unverified / Uncertain
- 小程序真机和微信开发者工具中尚未重新检查新的 `zhuxishe / 个人记事本` 文案是否全部按预期显示
- `.com` 静态页新文案尚未重新上传到服务器并浏览器验证
- 小程序内功能性中文文案（如“剧本库”“活动记录”等）本次未改，若后续需要更进一步避嫌还需单独设计替换策略
## Key Decisions
- 这次只改展示层品牌文案，不改数据库字段、接口、业务数据和功能入口
- 为避免误伤主流程，保留功能性中文文案，先只收紧品牌暴露最明显的位置：导航标题、首页标题、副标题、人格测试题干、`.com` 静态页说明
## Next Steps
- 在微信开发者工具中重新编译并检查首页与人格测试页面文案
- 将 `deploy/com-site/*` 重新上传到服务器，替换线上 `.com` 静态页
- 如果后续仍要进一步“去中文品牌化”，单独梳理小程序内剩余功能性中文文案并分批改
