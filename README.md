# 森 · SEN'S SPACE

> 记录光影，也记录生活。

基于 **Astro 7** + **Tailwind CSS 4** 重建的个人博客，从旧的 Hexo（ayer 主题）静态产物迁移而来。
暗夜极光主题，零 JS 起步，页面切换走 View Transitions。

---

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Astro 7.4 | 内容优先，默认不发货 JS，静态输出 |
| 样式 | Tailwind CSS 4.3 | CSS-first 配置，设计令牌集中在 `src/styles/global.css` |
| 内容 | Content Collections | 带 Zod schema 校验的 Markdown 集合 |
| 集成 | MDX / Sitemap / RSS | 支持 MDX 组件、自动站点地图、RSS 订阅 |
| 部署 | GitHub Actions | 推送即自动发布到 GitHub Pages |

## 目录结构

```
.
├── public/                  # 静态资源（图片、图标字体、favicon）
├── src/
│   ├── assets/              # 全量图标库备份（供裁剪脚本离线使用）
│   ├── components/          # Header / Footer / PostCard / Gallery / BackgroundFX …
│   ├── content/
│   │   └── blog/            # ← 文章放这里，一个 .md = 一篇文章
│   ├── layouts/             # BaseLayout（全站壳）/ PostLayout（文章页）
│   ├── pages/               # 路由：首页、博客、相册、归档、标签、友链、关于
│   ├── styles/global.css    # 设计令牌 + 全局样式 + Markdown 排版
│   └── content.config.ts    # 内容集合 schema
├── scripts/trim-icons.mjs   # 图标裁剪脚本（87KB → 1.6KB）
└── .github/workflows/       # 自动部署
```

## 写新文章

在 `src/content/blog/` 新建一个 `.md` 文件即可，文件名会成为 URL：

```markdown
---
title: '文章标题'
description: '一句话摘要，会显示在卡片和 SEO 里'
pubDate: 2026-11-02
cover: '/images/cover1.jpg'   # 可选，列表页封面
tags: ['摄影', '随笔']
featured: false              # 可选，首页精选
---

正文，支持 GFM 与 MDX。
```

可选字段见 `src/content.config.ts`。

## 本地开发

需要 **Node ≥ 22.23.4**（Astro 7 的最低要求）。

```bash
npm install
npm run dev       # 开发服务器 http://localhost:4321
npm run build     # 构建到 dist/
npm run preview   # 预览构建结果
```

仓库内 `.tools/node/` 已附带一份便携版 Node 22.23.4，若系统 Node 版本过低可直接使用：

```bash
export PATH="$PWD/.tools/node:$PATH"
```

### 图标裁剪

RemixIcon 全量 CSS 有 87KB，实际只用到 24 个图标。裁剪脚本会自动扫描源码中用到的
`ri-*` 类名，只保留对应规则：

```bash
node scripts/trim-icons.mjs
```

新增图标后跑一次即可。

## 部署

推送到仓库即自动发布，配置见 `.github/workflows/deploy.yml`。

**一次性设置**：仓库 → Settings → Pages → Source 选择 **GitHub Actions**。
