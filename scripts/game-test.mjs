/**
 * 小游戏实测：起静态服务 → 打开四个游戏页 → 模拟按键 → 截图 + 收集报错
 *   PATH=$PWD/.tools/node:$PATH node scripts/game-test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4399;
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
  } catch (e) {
    res.writeHead(500);
    res.end('err');
  }
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
});

/** 统计 canvas 非背景像素比例，判断是否真的画了东西 */
async function canvasInk(page, sel) {
  return page.evaluate((s) => {
    const c = document.querySelector(s);
    if (!c) return -1;
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 55) ink += 1;
    }
    return ink / (d.length / (4 * 37));
  }, sel);
}

const cases = [
  {
    name: 'arcade',
    url: '/games',
    shot: 'shots/arcade.png',
    run: async () => {},
  },
  {
    name: 'snake',
    url: '/games/snake',
    shot: 'shots/game-snake.png',
    canvas: '#snakeCanvas',
    run: async (page) => {
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.press('ArrowDown');
      await new Promise((r) => setTimeout(r, 900));
      await page.keyboard.press('ArrowRight');
      await new Promise((r) => setTimeout(r, 900));
      await page.keyboard.press('ArrowUp');
      await new Promise((r) => setTimeout(r, 700));
    },
  },
  {
    name: 'tetris',
    url: '/games/tetris',
    shot: 'shots/game-tetris.png',
    canvas: '#tetrisCanvas',
    run: async (page) => {
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 300));
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 400));
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 400));
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 500));
    },
  },
  {
    name: '2048',
    url: '/games/2048',
    shot: 'shots/game-2048.png',
    canvas: '#g2048Canvas',
    run: async (page) => {
      await page.keyboard.press('ArrowLeft');
      await new Promise((r) => setTimeout(r, 260));
      await page.keyboard.press('ArrowDown');
      await new Promise((r) => setTimeout(r, 260));
      await page.keyboard.press('ArrowRight');
      await new Promise((r) => setTimeout(r, 260));
      await page.keyboard.press('ArrowUp');
      await new Promise((r) => setTimeout(r, 260));
      await page.keyboard.press('ArrowLeft');
      await new Promise((r) => setTimeout(r, 400));
    },
  },
  {
    name: 'breakout',
    url: '/games/breakout',
    shot: 'shots/game-breakout.png',
    canvas: '#breakoutCanvas',
    run: async (page) => {
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 200));
      await page.keyboard.press('Space');
      await new Promise((r) => setTimeout(r, 1600));
    },
  },
];

let fail = 0;

for (const c of cases) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(BASE + c.url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));

  await c.run(page);

  let ink = null;
  if (c.canvas) ink = await canvasInk(page, c.canvas);

  await page.screenshot({ path: c.shot, fullPage: false });

  const bad = errors.length > 0 || (ink !== null && ink < 0.004);
  if (bad) fail += 1;
  console.log(
    `${bad ? 'FAIL' : 'OK  '} ${c.name.padEnd(9)} ink=${ink === null ? '-' : ink.toFixed(3)} errors=${errors.length}`,
  );
  errors.slice(0, 5).forEach((e) => console.log('     ' + e));

  await page.close();
}

await browser.close();
server.close();
console.log(fail === 0 ? 'ALL PASS' : `${fail} case(s) failed`);
process.exit(fail === 0 ? 0 : 1);
