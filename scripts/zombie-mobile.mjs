/**
 * 手机端布局检查：390×844 视口，模拟触摸设备
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4403;
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
page.on('pageerror', (e) => errors.push(e.message));

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE + '/games/zombie', { waitUntil: 'networkidle0' });
await wait(800);
await page.screenshot({ path: 'shots/zombie-mobile-1.png' });

await page.tap('#gzBtn');
await wait(500);
for (let i = 0; i < 20; i++) {
  const hidden = await page.evaluate(() => document.getElementById('gzDialog')?.hidden);
  if (hidden) break;
  await page.tap('#gzDialog').catch(() => {});
  await wait(200);
}
await wait(400);
await page.screenshot({ path: 'shots/zombie-mobile-2.png' });

const info = await page.evaluate(() => {
  const c = document.querySelector('#gzCanvas');
  const r = c.getBoundingClientRect();
  const atk = document.getElementById('gzAtk');
  const ar = atk.getBoundingClientRect();
  const cs = getComputedStyle(atk);
  return {
    canvas: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
    atkButton: { display: cs.display, w: Math.round(ar.width), h: Math.round(ar.height), top: Math.round(ar.top) },
    docW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > 390,
  };
});

console.log(JSON.stringify(info));
console.log('errors =', errors.length);
errors.slice(0, 5).forEach((e) => console.log('  ' + e));

await browser.close();
server.close();
