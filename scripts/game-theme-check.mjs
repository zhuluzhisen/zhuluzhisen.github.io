/** 浅色主题 + 手机视口抽查 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.xml': 'application/xml',
};
const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
});

async function snap(url, file, { width, height, light = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(BASE + url, { waitUntil: 'networkidle0' });
  if (light) {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      try { localStorage.setItem('fang-theme', 'light'); } catch {}
    });
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: file });
  console.log(file, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
  await page.close();
}

await snap('/games', 'shots/check-arcade-light.png', { width: 1440, height: 960, light: true });
await snap('/games/snake', 'shots/check-snake-light.png', { width: 1440, height: 960, light: true });
await snap('/games/tetris', 'shots/check-tetris-mobile.png', { width: 390, height: 844 });
await snap('/games/breakout', 'shots/check-breakout-mobile.png', { width: 390, height: 844 });

await browser.close();
server.close();
process.exit(0);
