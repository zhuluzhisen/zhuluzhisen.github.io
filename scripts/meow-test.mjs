/**
 * 《喵星防线》实测：起静态服务 → 真机放塔、开波、升级 → 截图 + 收集报错
 *   npm run build && node scripts/meow-test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', 'dist');
const SHOTS = path.resolve(HERE, '..', 'shots');
const PORT = 4406;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url);
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500);
    res.end('err');
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const warns = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  if (m.type() === 'warn' && m.text().includes('[meow]')) warns.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? '', sel);
const money = async () => Number((await text('#meowMoney')).replace(/[^0-9]/g, ''));
const log = (s) => console.log(s);

/** 场地坐标 → 页面坐标 */
async function fieldPoint(x, y) {
  const r = await page.evaluate(() => {
    const c = document.getElementById('meowCanvas').getBoundingClientRect();
    return { left: c.left, top: c.top, width: c.width, height: c.height };
  });
  return { x: r.left + (x / 800) * r.width, y: r.top + (y / 520) * r.height };
}

async function place(key, x, y) {
  const before = await money();
  await page.keyboard.press(key);
  const p = await fieldPoint(x, y);
  await page.mouse.move(p.x, p.y);
  await wait(60);
  await page.mouse.click(p.x, p.y);
  await wait(80);
  const after = await money();
  log(`放置 ${key} @(${x},${y})：$${before} → $${after}`);
  return after < before;
}

async function selectAt(x, y) {
  const p = await fieldPoint(x, y);
  await page.mouse.click(p.x, p.y);
  await wait(80);
}

await page.evaluateOnNewDocument((q) => localStorage.setItem('meow.quality', q), process.env.MEOW_QUALITY ?? 'high');
await page.goto(`${BASE}/games/meow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('meowBtn').disabled, { timeout: 15000 });
await wait(400);
log(`渲染器：${warns.length ? 'Canvas 2D 兜底（' + warns[0] + '）' : 'PixiJS / WebGL'}`);
await page.screenshot({ path: path.join(SHOTS, 'meow-title.png') });

await page.click('#meowBtn');
await wait(300);
log(`开局金币 ${await money()} · 鱼干 ${await text('#meowLives')}`);

// 放到路上应该失败
const onPath = await place('1', 200, 160);
log(`压在路上放置成功？${onPath}（应为 false）`);
await page.keyboard.press('Escape');

await place('1', 130, 160);
await place('1', 430, 200);

// 选中第一只并升级「猫眼」
await selectAt(130, 160);
log(`信息面板：${(await text('#meowInfo')).slice(0, 40).replace(/\s+/g, ' ')}`);
const m0 = await money();
await page.keyboard.press('x');
await wait(80);
log(`升级猫眼：$${m0} → $${await money()}`);

// 放置预览截图
await page.keyboard.press('2');
const ghost = await fieldPoint(610, 280);
await page.mouse.move(ghost.x, ghost.y);
await wait(120);
await page.screenshot({ path: path.join(SHOTS, 'meow-place.png') });
await page.keyboard.press('Escape');

// 3 倍速开第一波
await page.keyboard.press('f');
await page.keyboard.press('f');
await page.keyboard.press(' ');
await wait(3500);
await page.screenshot({ path: path.join(SHOTS, 'meow-wave1.png') });
const canvasShot = await page.$('#meowCanvas');
await canvasShot.screenshot({ path: path.join(SHOTS, 'meow-wave1-canvas.png') });

// 等第一波打完
for (let i = 0; i < 60; i++) {
  if ((await text('#meowNextText')).includes('第 2 波')) break;
  await wait(500);
}
log(`第 1 波后：${await text('#meowNextText')} · 鱼干 ${await text('#meowLives')} · 金币 ${await money()} · 戳破 ${await text('#meowPops')}`);

// 开自动，边打边补塔
await page.keyboard.press('a');
const plan = [
  ['1', 130, 340],
  ['2', 610, 280],
  ['3', 370, 170],
  ['4', 250, 330],
];
let pi = 0;
for (let i = 0; i < 240; i++) {
  if (pi < plan.length) {
    const cost = { 1: 200, 2: 450, 3: 350, 4: 300 }[plan[pi][0]];
    if ((await money()) >= cost) {
      await place(...plan[pi]);
      pi++;
    }
  }
  const wave = await text('#meowWave');
  if (Number(wave.split('/')[0]) >= 9) break;
  if (await page.evaluate(() => !document.getElementById('meowOverlay').hidden)) break;
  await wait(500);
}
await wait(1500);
await page.screenshot({ path: path.join(SHOTS, 'meow-mid.png') });
log(`中盘：波次 ${await text('#meowWave')} · 鱼干 ${await text('#meowLives')} · 金币 ${await money()} · 戳破 ${await text('#meowPops')}`);

// 卖出测试
await selectAt(430, 200);
const ms = await money();
await page.keyboard.press('Delete');
await wait(80);
log(`卖出：$${ms} → $${await money()}`);

// 暂停遮罩
await page.keyboard.press('p');
await wait(150);
log(`暂停遮罩：${await text('#meowTitle')}`);

// 游戏厅卡片
await page.goto(`${BASE}/games`, { waitUntil: 'networkidle0' });
await wait(500);
const card = await page.$('a[href="/games/meow"]');
log(`游戏厅卡片存在：${!!card} · 最高 ${await text('[data-best="meow"]')}`);
if (card) {
  await card.scrollIntoView();
  await wait(300);
  await card.screenshot({ path: path.join(SHOTS, 'meow-card.png') });
}

log(errors.length ? `\n报错 ${errors.length} 条：\n${errors.join('\n')}` : '\n无报错');
await browser.close();
server.close();
