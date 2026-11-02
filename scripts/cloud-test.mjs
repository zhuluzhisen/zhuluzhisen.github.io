/**
 * 云同步端到端测试（用假后端模拟 Supabase，不需要真账号）
 *
 * 前置：先构建一份「已配置云端」的产物
 *   PUBLIC_SUPABASE_URL=https://mock.supabase.co \
 *   PUBLIC_SUPABASE_ANON_KEY=<假key> \
 *   ./node_modules/.bin/astro build --outDir dist-cloud
 *
 * 运行：PATH=$PWD/.tools/node:$PATH node scripts/cloud-test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist-cloud');
const PORT = 4398;
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

/* ---------------- 假 Supabase ---------------- */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
  'content-type': 'application/json',
};

let cloudRow = {
  profile: { name: '云端玩家', createdAt: 1761900000000 },
  games: { snake: { best: 500, plays: 3, last: 500, at: 1761900000000 } },
};
let pushes = [];
let failMode = ''; // 'no-table' 时模拟表不存在

function attach(page) {
  page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();

    if (req.method() === 'OPTIONS') {
      req.respond({ status: 204, headers: CORS, body: '' });
      return;
    }

    if (url.includes('mock.supabase.co/rest/v1/player_state')) {
      if (failMode === 'no-table') {
        req.respond({
          status: 404,
          headers: CORS,
          body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.player_state'" }),
        });
        return;
      }
      const method = req.method();
      if (method === 'GET') {
        req.respond({
          status: 200,
          headers: CORS,
          body: JSON.stringify(cloudRow ? [{ data: cloudRow, updated_at: new Date().toISOString() }] : []),
        });
        return;
      }
      if (method === 'POST') {
        const body = JSON.parse(req.postData() || '[]');
        cloudRow = body[0]?.data ?? cloudRow;
        pushes.push(cloudRow);
        req.respond({ status: 201, headers: CORS, body: '' });
        return;
      }
      if (method === 'DELETE') {
        cloudRow = null;
        req.respond({ status: 204, headers: CORS, body: '' });
        return;
      }
    }

    if (url.includes('mock.supabase.co/auth/v1/')) {
      req.respond({ status: 200, headers: CORS, body: JSON.stringify({ ok: true }) });
      return;
    }

    req.continue();
  });
}

/* ---------------- 测试骨架 ---------------- */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
});

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  // 假后端故意制造的 404 会产生网络错误日志，不算 bug
  if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text());
});
attach(page);
await page.setViewport({ width: 1440, height: 1000 });

/** 注入登录态（相当于用户已经登录过） */
const injectSession = async () => {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem(
      'sen.cloud.session.v1',
      JSON.stringify({
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        expires_at: Date.now() + 3600_000,
        user: { id: 'user-1', name: '云端玩家', email: 'test@example.com', avatar: '' },
      }),
    );
  });
};

const chipText = () => page.$eval('#pbLabel', (el) => el.textContent.trim()).catch(() => '');
const chipState = () => page.$eval('#pbChip', (el) => el.dataset.state).catch(() => '');
const rowText = () =>
  page.$eval('#arcRows', (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

/* ============ 1. 未登录：能看到登录入口 ============ */
await page.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await wait(500);
await page.click('#pbChip');
await wait(350);
const signInVisible = await page.$eval('#pbCloudSignIn', (el) => !el.hasAttribute('hidden')).catch(() => false);
check('已配置云端时，面板出现「用 GitHub 登录」', signInVisible);
await page.evaluate(() => document.querySelector('#pbDialog').close());

/* ============ 2. 已登录：拉取云端数据 ============ */
await injectSession();
await page.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await page.waitForFunction(
  () => document.getElementById('pbLabel')?.textContent.trim() === '云端玩家',
  { timeout: 8000 },
).catch(() => {});
check('登录后胶囊显示账号名', (await chipText()) === '云端玩家', await chipText());
check('胶囊状态切到 cloud', (await chipState()) === 'cloud', await chipState());

await wait(600);
const rows = await rowText();
check('云端战绩被拉取并渲染', rows.includes('500'), rows.slice(0, 140));

// 截图：已登录面板
await page.click('#pbChip');
await wait(500);
await page.screenshot({ path: 'shots/cloud-signed-in.png' });
await page.evaluate(() => document.querySelector('#pbDialog').close());
await wait(200);

/* ============ 3. 打一局后自动回推 ============ */
const pushesBefore = pushes.length;
await page.goto(BASE + '/games/snake/', { waitUntil: 'networkidle0' });
await wait(500);
await page.keyboard.press('Space'); // 开始
await wait(300);
await page.keyboard.press('ArrowUp'); // 直接撞上边墙，快速结束
await wait(3000);
check('玩一局后自动推送到云端', pushes.length > pushesBefore, `push 次数 ${pushes.length - pushesBefore}`);

const latest = pushes[pushes.length - 1] || {};
check('推送内容包含本局记录（局数递增）', (latest?.games?.snake?.plays || 0) > 3, String(latest?.games?.snake?.plays));
check('推送没有冲掉云端的贪吃蛇最高分', latest?.games?.snake?.best === 500, String(latest?.games?.snake?.best));

/* ============ 4. 换设备：清本地缓存，只靠云端恢复 ============ */
await page.evaluate(() => localStorage.removeItem('sen.cloud.cache.v1'));
await page.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await page.waitForFunction(
  () => document.getElementById('pbChip')?.dataset.state === 'cloud',
  { timeout: 8000 },
).catch(() => {});
await wait(900);
const rowsAfter = await rowText();
check('清掉本地缓存后仍能从云端取回最高分', /贪吃蛇 500/.test(rowsAfter.replace(/\s+/g, ' ')), rowsAfter.slice(0, 120));

/* ============ 5. 未登录时玩的局，登录后合并上云 ============ */
// 用独立浏览器上下文，否则会和上面的登录态共享 localStorage
const ctx2 = await browser.createBrowserContext();
const page2 = await ctx2.newPage();
attach(page2);
await page2.setViewport({ width: 1280, height: 900 });
await page2.goto(BASE + '/games/snake/', { waitUntil: 'networkidle0' });
await wait(500);
const stateBefore = await page2.$eval('#pbChip', (el) => el.dataset.state).catch(() => '');
await page2.keyboard.press('Space');
await wait(300);
await page2.keyboard.press('ArrowDown');
await wait(3000);
const guestRaw = await page2.evaluate(() => localStorage.getItem('sen.guest.v1') || '');
check('全新设备默认是游客', stateBefore === 'empty', stateBefore);
check('未登录时数据仍落游客区', guestRaw.length > 0, `${guestRaw.length} 字节`);

await page2.evaluate(() => {
  localStorage.setItem(
    'sen.cloud.session.v1',
    JSON.stringify({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_at: Date.now() + 3600_000,
      user: { id: 'user-1', name: '云端玩家', email: 'test@example.com', avatar: '' },
    }),
  );
});
await page2.reload({ waitUntil: 'networkidle0' });
await wait(2000);
const guestAfter = await page2.evaluate(() => localStorage.getItem('sen.guest.v1'));
const chip2 = await page2.$eval('#pbLabel', (el) => el.textContent.trim()).catch(() => '');
check(
  '登录后游客数据被并入账号（游客区清空）',
  guestAfter === null && chip2 === '云端玩家',
  `guest=${guestAfter} chip=${chip2}`,
);
await page2.close();
await ctx2.close();

/* ============ 6. 表不存在时给出可诊断的提示 ============ */
failMode = 'no-table';
const page3 = await browser.newPage();
attach(page3);
await page3.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await wait(1200);
await page3.click('#pbChip');
await wait(500);
const cloudErr = await page3.$eval('#pbCloudErr', (el) => (el.hasAttribute('hidden') ? '' : el.textContent.trim())).catch(() => '');
check('表没建好时提示具体原因', cloudErr.includes('建好') || cloudErr.includes('sql'), cloudErr);
failMode = '';
await page3.close();

/* ============ 7. 退出登录回到本地态 ============ */
await page.click('#pbChip').catch(() => {});
await wait(300);
page.on('dialog', (d) => d.accept());
await page.click('#pbSignOut').catch(() => {});
await wait(600);
const afterSignOut = await chipState();
check('退出登录后回到本地状态', afterSignOut !== 'cloud', afterSignOut);

check('全程无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.screenshot({ path: 'shots/cloud-signed-out.png' });
await page.close();
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
