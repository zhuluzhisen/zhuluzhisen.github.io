/**
 * 截图验收：桌面 + 移动 的首页与秘密档案
 *   node scripts/shot.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:4321';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
});

const shots = [
  { name: 'home-desktop', path: '/', width: 1440, height: 900, full: false },
  { name: 'home-desktop-full', path: '/', width: 1440, height: 900, full: true },
  { name: 'home-mobile', path: '/', width: 390, height: 844, full: true },
  { name: 'secret-desktop', path: '/secret', width: 1440, height: 900, full: true },
  { name: 'secret-mobile', path: '/secret', width: 390, height: 844, full: true },
];

for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 1 });
  await page.goto(BASE + s.path, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  // 关闭 reveal 的初始透明，保证整页截图内容可见
  await page.evaluate(() => {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `shots/${s.name}.png`, fullPage: s.full });
  console.log('saved', s.name);
  await page.close();
}

await browser.close();
