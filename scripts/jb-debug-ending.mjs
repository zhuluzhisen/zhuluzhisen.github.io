// 定位结局对话卡住的原因：只跑到最后的 homeNight，打印每次按键后的对话状态
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4405;
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
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end('nf');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${PORT}/games/jingbian`, { waitUntil: 'networkidle0' });
await wait(600);
await page.click('#jbBtn');
await wait(400);

// 直接跳到 homeNight：连续过门
for (let sceneStep = 0; sceneStep < 8; sceneStep++) {
  // 清对话
  for (let i = 0; i < 40; i++) {
    const h = await page.evaluate(() => document.getElementById('jbDialog')?.hidden);
    if (h) break;
    await page.keyboard.press('Space');
    await wait(90);
  }
  const ex = await page.evaluate(() => window.__jb?.exits?.[0]);
  if (!ex) break;
  await page.evaluate(() => window.__jb?.killAll());
  await page.evaluate((x, y) => window.__jb?.tp(x, y), Math.floor(ex.x / 16), Math.floor(ex.y / 16));
  await wait(400);
}

console.log('arrived:', await page.evaluate(() => window.__jb?.scene));
for (let i = 0; i < 26; i++) {
  const st = await page.evaluate(() => ({
    hidden: document.getElementById('jbDialog')?.hidden,
    phase: window.__jb?.phase,
    i: window.__jb?.dialog?.i,
    total: window.__jb?.dialog?.total,
    active: window.__jb?.dialog?.active,
    txt: (window.__jb?.dialog?.text ?? '').slice(0, 18),
  }));
  console.log(i, JSON.stringify(st));
  if (st.hidden && st.phase !== 'dialog') break;
  await page.keyboard.press('Space');
  await wait(160);
}
console.log('final:', await page.evaluate(() => ({ phase: window.__jb?.phase, overlay: document.getElementById('jbOverlay')?.hidden })));
await browser.close();
server.close();
