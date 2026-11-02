/**
 * 图标裁剪脚本
 *
 * RemixIcon 全量 CSS 约 87KB，但本站只用到 20 多个图标。
 * 本脚本拉取全量 CSS，只保留实际使用到的图标规则，输出到 public/fonts/remixicon.css。
 *
 *   node scripts/trim-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public/fonts/remixicon.css');
const MIRROR = 'https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css';

// ---------- 1. 收集用到的图标 ----------
const used = new Set();
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(astro|md|mdx|html|ts|js)$/.test(e.name)) {
      const txt = fs.readFileSync(p, 'utf8');
      for (const m of txt.matchAll(/\bri-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) used.add(m[0]);
    }
  }
}
walk(path.join(root, 'src'));

// ---------- 2. 获取全量 CSS ----------
async function fetchFull() {
  try {
    const res = await fetch(MIRROR, { signal: AbortSignal.timeout(20000) });
    if (res.ok) return await res.text();
  } catch (e) {
    console.warn('[icons] CDN 不可用，尝试本地备份');
  }
  const local = path.join(root, 'src/assets/remixicon.full.css');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  return null;
}

const full = await fetchFull();
if (!full) {
  console.error('[icons] 无法获取 remixicon CSS，已保留现有 public/fonts/remixicon.css');
  process.exit(0);
}

// ---------- 3. 裁剪 ----------
const rules = [];
for (const line of full.split('\n')) {
  const m = line.match(/^\.(ri-[a-z0-9-]+):before\s*\{\s*content:\s*"([^"]+)";/);
  if (m && used.has(m[1])) rules.push(`  .${m[1]}:before { content: '${m[2]}'; }`);
}

const missing = [...used].filter(
  (u) => !rules.some((r) => r.includes(`.${u}:before`)),
);

const out = `/* Remix Icon (精简版) — 由 scripts/trim-icons.mjs 自动生成，请勿手改 */
/* 实际使用 ${used.size} 个图标，保留 ${rules.length} 条规则 */

@font-face {
  font-family: 'remixicon';
  src: url('remixicon.woff2') format('woff2');
  url('remixicon.woff') format('woff');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

[class^='ri-'],
[class*=' ri-'] {
  display: inline-block;
  font-family: 'remixicon' !important;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

${rules.join('\n')}
`;

fs.writeFileSync(OUT, out, 'utf8');
console.log(`[icons] 使用 ${used.size} 个图标 → 保留 ${rules.length} 条规则，${(out.length / 1024).toFixed(1)}KB`);
if (missing.length) console.warn(`[icons] ⚠ 以下图标在图标库中不存在，需替换: ${missing.join(', ')}`);
