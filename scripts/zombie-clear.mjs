/**
 * 通关测试：走到街道 → 逐个清怪 → 验证结局遮罩
 *   "/c/Program Files/nodejs/node.exe" scripts/zombie-clear.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4402;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url);
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('nf');
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(BASE + '/games/zombie', { waitUntil: 'networkidle0' });
await wait(700);

async function clearDialog(max = 40) {
  for (let i = 0; i < max; i++) {
    const hidden = await page.evaluate(() => document.getElementById('gzDialog')?.hidden);
    if (hidden) return true;
    await page.keyboard.press('Space');
    await wait(190);
  }
  return false;
}

await page.click('#gzBtn');
await wait(400);
await clearDialog();

// 传送到病房门口并走出去
await page.evaluate(() => window.__gz.tp(11, 10));
await wait(200);
await page.evaluate(() => window.__gz.tp(11, 11));
await wait(900);
let scene = await page.evaluate(() => window.__gz.scene);
console.log('after ward door  ->', scene);
await clearDialog();
await wait(200);

// 传送到走廊出口
await page.evaluate(() => window.__gz.tp(32, 5));
await wait(200);
await page.evaluate(() => window.__gz.tp(33, 5));
await wait(900);
scene = await page.evaluate(() => window.__gz.scene);
console.log('after corridor   ->', scene);
await clearDialog();
await wait(200);
await page.screenshot({ path: 'shots/zombie-6-street.png' });

// 逐个清怪：传送到目标身边狂砍
for (let round = 0; round < 24; round++) {
  const info = await page.evaluate(() => {
    const zs = window.__gz.zombies.filter((z) => !z.dead);
    return { alive: zs.length, phase: window.__gz.phase, first: zs[0] || null };
  });
  if (!info.alive) break;
  if (info.phase !== 'play') {
    await clearDialog();
    await wait(200);
    continue;
  }
  const z = info.first;
  await page.evaluate(
    (zx, zy) => {
      // 站到丧尸左侧 10px 处
      const tx = Math.floor((zx - 12) / 16);
      const ty = Math.floor(zy / 16);
      window.__gz.tp(tx, ty);
    },
    z.x,
    z.y,
  );
  await wait(120);
  for (let k = 0; k < 14; k++) {
    await page.keyboard.press('Space');
    await wait(150);
  }
  const hp = await page.evaluate(() => window.__gz.player.hp);
  if (hp <= 0) {
    console.log('player died during clear test');
    break;
  }
}

await wait(1400);
await page.screenshot({ path: 'shots/zombie-7-clear.png' });

// 若结局对话弹出，推完它
await clearDialog(30);
await wait(900);

const final = await page.evaluate(() => ({
  phase: window.__gz.phase,
  scene: window.__gz.scene,
  kills: window.__gz.kills,
  hp: window.__gz.player.hp,
  dialog: window.__gz.dialog,
  overlayHidden: document.getElementById('gzOverlay')?.hidden,
  overlayTitle: document.getElementById('gzTitle')?.textContent,
  overlayKicker: document.getElementById('gzKicker')?.textContent,
  alive: window.__gz.zombies.filter((z) => !z.dead).length,
}));

await page.screenshot({ path: 'shots/zombie-8-ending.png' });

console.log('final =', JSON.stringify(final));
console.log('errors =', errors.length);
errors.slice(0, 6).forEach((e) => console.log('  ' + e));

await browser.close();
server.close();
process.exit(errors.length || final.phase !== 'clear' ? 1 : 0);
