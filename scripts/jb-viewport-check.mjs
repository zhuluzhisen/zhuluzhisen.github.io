/**
 * 《惊变一百天》页面体检：桌面 / 手机 / 亮色主题 / 深色主题
 * 检查：横向溢出、画布尺寸、手机面板位置、对话框可读性
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4407;
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
const out = [];
const log = (s) => {
  out.push(s);
  console.log(s);
};

async function probe(label, width, height, theme) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/games/jingbian`, { waitUntil: 'networkidle0' });
  if (theme === 'light') {
    await page.evaluate(() => {
      localStorage.setItem('fang-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await wait(300);
  }
  await wait(500);
  await page.click('#jbBtn');
  await wait(600);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Space');
    await wait(120);
  }
  await wait(400);

  const info = await page.evaluate(() => {
    const c = document.querySelector('#jbCanvas');
    const r = c.getBoundingClientRect();
    const phone = document.querySelector('.jb-phone')?.getBoundingClientRect();
    const screen = document.querySelector('.jb-screen')?.getBoundingClientRect();
    const m = document.querySelector('.jb-msg-text');
    const cs = m ? getComputedStyle(m) : null;
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      canvasCss: `${Math.round(r.width)}×${Math.round(r.height)}`,
      ratio: +(r.width / r.height).toFixed(3),
      screenTop: Math.round(screen.top),
      phoneTop: Math.round(phone.top),
      phoneBelowCanvas: phone.top >= screen.bottom - 1,
      msgColor: cs ? cs.color : null,
      theme: document.documentElement.getAttribute('data-theme'),
    };
  });
  await page.screenshot({ path: `shots/jb-vp-${label}.png`, fullPage: false });
  log(
    `${label.padEnd(18)} ${width}×${height} 主题=${info.theme} | 画布 ${info.canvasCss} (比例 ${info.ratio}) | 横向溢出 ${info.overflowX}px | 手机面板在画布下方=${info.phoneBelowCanvas} | 群消息色 ${info.msgColor} | 报错 ${errs.length}`,
  );
  await page.close();
}

await probe('desktop-dark', 1440, 1000, 'dark');
await probe('desktop-light', 1440, 1000, 'light');
await probe('tablet-dark', 834, 1000, 'dark');
await probe('mobile-dark', 390, 844, 'dark');
await probe('mobile-light', 390, 844, 'light');

await browser.close();
server.close();
fs.writeFileSync('shots/jb-viewport.txt', out.join('\n'), 'utf8');
