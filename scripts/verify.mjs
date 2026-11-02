/**
 * 项目完整性核对脚本
 *
 *   node scripts/verify.mjs
 *
 * 检查项：
 *   1. 目录结构与关键文件是否齐全
 *   2. 内容集合 frontmatter 是否符合 schema
 *   3. 所有引用的静态资源（图片等）是否真实存在
 *   4. 所有用到的 ri-* 图标是否都有对应的 CSS 规则
 *   5. 构建产物是否包含全部路由，内部链接是否可解析
 *   6. 产物体积与性能预算
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const warnings = [];
const pass = [];

const ok = (m) => pass.push(m);
const bad = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

// ---------- 工具 ----------
function walk(dir, filter = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');
const size = (p) => (fs.existsSync(p) ? fs.statSync(p).size : 0);

console.log('\n══════ 项目完整性核对 ══════\n');

// ---------- 1. 目录结构 ----------
console.log('【1】目录结构');
const required = [
  'package.json',
  'astro.config.mjs',
  'tsconfig.json',
  '.gitignore',
  'README.md',
  'src/content.config.ts',
  'src/styles/global.css',
  'src/layouts/BaseLayout.astro',
  'src/layouts/PostLayout.astro',
  'src/components/Header.astro',
  'src/components/Footer.astro',
  'src/components/PostCard.astro',
  'src/components/Gallery.astro',
  'src/components/Marquee.astro',
  'src/components/BackgroundFX.astro',
  'src/pages/index.astro',
  'src/pages/blog/index.astro',
  'src/pages/blog/[...slug].astro',
  'src/pages/gallery.astro',
  'src/pages/archives.astro',
  'src/pages/tags/index.astro',
  'src/pages/tags/[tag].astro',
  'src/pages/about.astro',
  'src/pages/friends.astro',
  'src/pages/404.astro',
  'src/pages/rss.xml.ts',
  '.github/workflows/deploy.yml',
  'public/favicon.ico',
  'public/fonts/remixicon.css',
  'public/fonts/remixicon.woff2',
  'scripts/trim-icons.mjs',
];
const missingFiles = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missingFiles.length) bad(`缺少文件: ${missingFiles.join(', ')}`);
else ok(`${required.length} 个关键文件齐全`);

const pages = walk(path.join(root, 'src/pages'), (p) => /\.astro$/.test(p));
console.log(`     页面文件: ${pages.length} 个`);

// ---------- 2. 内容集合 ----------
console.log('【2】内容集合');
const posts = walk(path.join(root, 'src/content/blog'), (p) => /\.mdx?$/.test(p));
const schemaRe = /z\.object\(\{([\s\S]*?)\n  \}\),/;
const schemaRaw = read(path.join(root, 'src/content.config.ts'));
const schemaFields = new Set(
  [...schemaRaw.matchAll(/^\s+(\w+):/gm)]
    .map((m) => m[1])
    .filter((f) => !['schema', 'loader', 'base', 'pattern'].includes(f)),
);
const requiredFields = ['title', 'description', 'pubDate'];
let contentOk = 0;
for (const p of posts) {
  const txt = read(p);
  const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    bad(`${rel(p)}: 缺少 frontmatter`);
    continue;
  }
  const body = fm[1];
  for (const f of requiredFields) {
    if (!new RegExp(`^${f}:`, 'm').test(body)) bad(`${rel(p)}: 缺少必填字段 ${f}`);
  }
  for (const m of body.matchAll(/^(\w+):/gm)) {
    if (!schemaFields.has(m[1])) warn(`${rel(p)}: 字段 ${m[1]} 不在 schema 中`);
  }
  const title = body.match(/^title:\s*['"]?(.+?)['"]?$/m)?.[1];
  const date = body.match(/^pubDate:\s*(\S+)/m)?.[1];
  if (!date || Number.isNaN(Date.parse(date))) bad(`${rel(p)}: pubDate 非法 (${date})`);
  else contentOk++;
  console.log(`     · ${title ?? '(无标题)'}  [${date}]  ${rel(p)}`);
}
if (contentOk === posts.length) ok(`${posts.length} 篇文章 frontmatter 全部合规`);
console.log(`     schema 字段: ${[...schemaFields].join(', ')}`);

// ---------- 3. 资源引用 ----------
console.log('【3】静态资源引用');
// src/assets/remixicon.full.css 是图标库全量备份，会包含所有图标名，需排除
const srcFiles = walk(
  path.join(root, 'src'),
  (p) => /\.(astro|md|mdx|css|ts)$/.test(p) && !p.endsWith('remixicon.full.css'),
);
const referenced = new Set();
for (const f of srcFiles) {
  const txt = read(f);
  for (const m of txt.matchAll(/["'(](\/images\/[^"')\s]+|\/fonts\/[^"')\s]+|\/[^"')\s]*\.(?:ico|png|jpg|jpeg|svg|webp))["')]/gi)) {
    referenced.add(m[1]);
  }
}
let assetOk = 0;
for (const r of [...referenced].sort()) {
  const onDisk = fs.existsSync(path.join(root, 'public', r.replace(/^\//, '')));
  if (onDisk) assetOk++;
  else bad(`资源缺失: ${r}  (引用自 ${srcFiles.filter((f) => read(f).includes(r)).map(rel).join(', ')})`);
}
ok(`${assetOk}/${referenced.size} 个静态资源引用可解析`);

// 未被引用的图片（提示性）
const imgs = walk(path.join(root, 'public/images'), (p) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(p));
const unusedImgs = imgs.filter((p) => !referenced.has('/' + rel(p).replace('public/', '')));
if (unusedImgs.length)
  warn(`未被引用的图片 ${unusedImgs.length} 个: ${unusedImgs.map((p) => path.basename(p)).join(', ')}`);

// ---------- 4. 图标 ----------
console.log('【4】图标完整性');
const iconCss = read(path.join(root, 'public/fonts/remixicon.css'));
const cssIcons = new Set([...iconCss.matchAll(/\.(ri-[a-z0-9-]+):before/g)].map((m) => m[1]));
const usedIcons = new Set();
for (const f of srcFiles) {
  for (const m of read(f).matchAll(/\bri-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) usedIcons.add(m[0]);
}
const missingIcons = [...usedIcons].filter((i) => !cssIcons.has(i));
if (missingIcons.length)
  bad(`图标缺少 CSS 规则: ${missingIcons.join(', ')}  → 运行 node scripts/trim-icons.mjs`);
else ok(`${usedIcons.size} 个图标全部有对应规则（CSS ${(iconCss.length / 1024).toFixed(1)}KB）`);

// ---------- 5. 构建产物 ----------
console.log('【5】构建产物');
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) {
  bad('dist 不存在，请先运行 npm run build');
} else {
  const html = walk(dist, (p) => p.endsWith('.html'));
  const expected = [
    'index.html',
    '404.html',
    'blog/index.html',
    'gallery/index.html',
    'archives/index.html',
    'tags/index.html',
    'about/index.html',
    'friends/index.html',
    'rss.xml',
    'sitemap-index.xml',
  ];
  const missingOut = expected.filter((f) => !fs.existsSync(path.join(dist, f)));
  if (missingOut.length) bad(`产物缺失: ${missingOut.join(', ')}`);
  else ok(`核心产物齐全（${html.length} 个 HTML）`);

  // 每篇文章的产物
  const postOut = posts.filter((p) => {
    const id = path.basename(p).replace(/\.mdx?$/, '');
    return fs.existsSync(path.join(dist, 'blog', id, 'index.html'));
  });
  if (postOut.length !== posts.length)
    bad(`文章产物不全: ${posts.length - postOut.length} 篇缺失`);
  else ok(`${posts.length} 篇文章均有独立页面`);

  // 内部链接解析：路由集合 = HTML 页面 + 静态文件
  const routes = new Set();
  for (const h of html) {
    let r = '/' + rel(h).replace(/^dist\//, '').replace(/index\.html$/, '');
    routes.add(r.replace(/\/$/, '') || '/');
  }
  for (const f of walk(dist, (p) => !p.endsWith('.html'))) {
    routes.add('/' + rel(f).replace(/^dist\//, ''));
  }
  const broken = new Set();
  for (const h of html) {
    const txt = read(h);
    for (const m of txt.matchAll(/href="(\/[^"#?]*)/g)) {
      const raw = m[1];
      let link;
      try {
        link = decodeURIComponent(raw).replace(/\/$/, '') || '/';
      } catch {
        link = raw.replace(/\/$/, '') || '/';
      }
      if (link.startsWith('/_astro')) continue;
      if (!routes.has(link) && !routes.has(raw.replace(/\/$/, '') || '/')) {
        broken.add(`${rel(h)} → ${raw}`);
      }
    }
  }
  if (broken.size)
    bad(`失效的内部链接 ${broken.size} 处:\n     ${[...broken].slice(0, 12).join('\n     ')}`);
  else ok('所有内部链接均可解析到已生成页面');
}

// ---------- 6. 体积 ----------
console.log('【6】产物体积');
if (fs.existsSync(dist)) {
  const js = walk(path.join(dist, '_astro'), (p) => p.endsWith('.js'));
  const css = walk(path.join(dist, '_astro'), (p) => p.endsWith('.css'));
  const jsTotal = js.reduce((s, f) => s + size(f), 0);
  const cssTotal = css.reduce((s, f) => s + size(f), 0);
  const htmlTotal = walk(dist, (p) => p.endsWith('.html')).reduce((s, f) => s + size(f), 0);
  const total = walk(dist).reduce((s, f) => s + size(f), 0);
  console.log(`     JS   ${(jsTotal / 1024).toFixed(1)}KB  (${js.length} 个文件)`);
  console.log(`     CSS  ${(cssTotal / 1024).toFixed(1)}KB  (${css.length} 个文件)`);
  console.log(`     HTML ${(htmlTotal / 1024).toFixed(1)}KB`);
  console.log(`     总计 ${(total / 1024 / 1024).toFixed(2)}MB`);
  if (jsTotal > 120 * 1024) warn(`JS 体积 ${(jsTotal / 1024).toFixed(0)}KB 偏大`);
  else ok(`JS 体积 ${(jsTotal / 1024).toFixed(1)}KB，在预算内`);
}

// ---------- 汇总 ----------
console.log('\n────── 核对结果 ──────');
pass.forEach((m) => console.log(`  ✓ ${m}`));
warnings.forEach((m) => console.log(`  ! ${m}`));
problems.forEach((m) => console.log(`  ✗ ${m}`));
console.log(
  `\n通过 ${pass.length} · 提示 ${warnings.length} · 问题 ${problems.length}\n`,
);

process.exit(problems.length ? 1 : 0);
