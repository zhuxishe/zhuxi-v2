# Handoff — 竹溪社 V2 项目

## 当前状态
- 完整实施计划已批准：`C:\Users\yunyo\.claude\plans\woolly-wandering-panda.md`
- 正在开始 Phase 0（项目脚手架）
- GitHub 仓库已创建：https://github.com/zhuxisheapp/zhuxi-v2.git
- Supabase 项目正在创建中（zhuxishe's Org，东京区域 ap-northeast-1）

## 下一步：Phase 0 脚手架搭建
1. `pnpm create next-app` 初始化 Next.js 16.x 项目
2. 安装依赖：@supabase/ssr, next-intl, lucide-react, clsx, tailwind-merge, cva
3. 从旧项目 `I:\app\zhuxi` 复制基础文件：
   - src/i18n/ — 国际化配置
   - src/lib/supabase/client.ts, server.ts — Supabase 客户端
   - src/lib/utils.ts — 工具函数
   - src/data/universities.json, majors.json — 学校/专业数据
4. 从旧项目复制 UI 组件：
   - button.tsx, card.tsx, avatar.tsx, badge.tsx, dialog.tsx
   - SchoolSearchSelect.tsx, MajorSearchSelect.tsx, ImageUpload.tsx
   - TagBadge.tsx, FilterBar.tsx, EmptyState.tsx
5. 新建共享组件：MultiTagSelect, SingleSelect, FormStepIndicator
6. 连接 GitHub remote + 初始提交

## 关键决策
- **认证**: Google OAuth + LINE Login + 邮箱密码
- **UI 风格**: 参照田的原型（简单、高档感）
  - 参考：D:\OneDrive\7_竹溪社\竹溪社app\田\zhuxishe_preview_fix-20260323T071940Z-3-001
- **标签字典**: 先代码常量，Phase 2 迁移到数据库
- **代码原则**: 每文件 <150 行，一功能一函数，查询函数按表拆分

## 旧项目路径
- 主 App: I:\app\zhuxi （Next.js 16.x + Supabase）
- 匹配算法: I:\app\zhuxi-matching
- 数据模板: D:\OneDrive\7_竹溪社\竹溪社app\田\club_member_template.xlsx
- 面试稿: D:\OneDrive\7_竹溪社\竹溪社app\田\面试稿.docx

## 服务清单
- GitHub: zhuxisheapp/zhuxi-v2
- Supabase: zhuxishe's Org / zhuxishe 项目 (东京)
- Vercel: 待创建，连接新 GitHub 仓库
- 旧 Supabase: qzemqhanbolwgpsxxnuh (首尔，旧项目)
