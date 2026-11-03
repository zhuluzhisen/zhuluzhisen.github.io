/**
 * 把游戏画布原始像素导出成 PNG（放大 4 倍，最近邻），用于诊断渲染问题
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4401;
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
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(BASE + '/games/zombie', { waitUntil: 'networkidle0' });
await wait(600);
await page.click('#gzBtn');
await wait(400);

for (let i = 0; i < 30; i++) {
  await page.keyboard.press('Space');
  await wait(90);
}
await wait(300);

const info = await page.evaluate(() => {
  const c = document.querySelector('#gzCanvas');
  const r = c.getBoundingClientRect();
  const big = document.createElement('canvas');
  big.width = c.width * 4;
  big.height = c.height * 4;
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(c, 0, 0, big.width, big.height);
  return {
    w: c.width,
    h: c.height,
    cssW: Math.round(r.width),
    cssH: Math.round(r.height),
    data: big.toDataURL('image/png'),
  };
});

fs.writeFileSync('shots/zombie-canvas-raw.png', Buffer.from(info.data.split(',')[1], 'base64'));
console.log('canvas', info.w, 'x', info.h, '| css', info.cssW, 'x', info.cssH);

await browser.close();
server.close();
