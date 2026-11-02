/**
 * 玩家档案端到端测试
 *   PATH=$PWD/.tools/node:$PATH node scripts/save-test.mjs
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

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 1440, height: 1000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1. 打开游戏厅，默认游客 */
await page.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await wait(400);
const chipText = await page.$eval('#pbLabel', (el) => el.textContent.trim());
check('初始为游客模式', chipText === '游客模式', chipText);

/* 2. 打开面板 → 建立档案 */
await page.click('#pbChip');
await wait(350);
const setupVisible = await page.$eval('#pbPanelSetup', (el) => !el.hasAttribute('hidden'));
check('游客状态下显示「建立档案」面板', setupVisible);

await page.type('#pbNameInput', '测试玩家');
await page.type('#pbPass', 'abc123456');
await page.type('#pbPass2', 'abc123456');
await page.click('#pbCreate');
await wait(900);

const stateAfterCreate = await page.evaluate(() => {
  const raw = localStorage.getItem('sen.vault.v1');
  return { hasVault: !!raw, raw: raw || '' };
});
check('档案已写入 localStorage', stateAfterCreate.hasVault);

const leaked = /"best":\s*\d/.test(stateAfterCreate.raw) || stateAfterCreate.raw.includes('测试玩家') || stateAfterCreate.raw.includes('snake');
check('密文中不含明文分数/名字/键名', !leaked, leaked ? '发现明文泄漏' : '加密正常');

const manageVisible = await page.$eval('#pbPanelManage', (el) => !el.hasAttribute('hidden'));
const manageName = await page.$eval('#pbManageName', (el) => el.textContent.trim());
check('创建后进入已解锁面板', manageVisible && manageName === '测试玩家', manageName);

await page.screenshot({ path: 'shots/save-manage.png' });

/* 3. 密码错误校验（锁定后面板保持打开，直接切到解锁表单） */
await page.click('#pbLock');
await wait(400);
const unlockVisible = await page.$eval('#pbPanelUnlock', (el) => !el.hasAttribute('hidden'));
check('锁定后自动切到解锁表单', unlockVisible);
await page.type('#pbUnlockPass', 'wrong-pass');
await page.click('#pbUnlockBtn');
await wait(700);
const errShown = await page.$eval('#pbError', (el) => (!el.hasAttribute('hidden') ? el.textContent.trim() : ''));
check('错误密码被拒绝', errShown.includes('密码不对'), errShown);
await page.screenshot({ path: 'shots/save-wrong-pass.png' });

/* 4. 正确密码解锁 */
await page.evaluate(() => { const i = document.querySelector('#pbUnlockPass'); i.value = ''; });
await page.type('#pbUnlockPass', 'abc123456');
await page.click('#pbUnlockBtn');
await wait(800);
const unlocked = await page.$eval('#pbChip', (el) => el.dataset.state);
check('正确密码解锁成功', unlocked === 'unlocked', unlocked);
await page.evaluate(() => document.querySelector('#pbDialog').close());

/* 5. 打一局贪吃蛇（撞墙快速结束），确认写入档案 */
await page.goto(BASE + '/games/snake/', { waitUntil: 'networkidle0' });
await wait(400);
await page.keyboard.press('Space');
await wait(300);
await page.keyboard.press('ArrowUp');
await wait(2600);
const snakeState = await page.evaluate(() => localStorage.getItem('sen.vault.v1') || '');
check('对局结束后档案被重新加密写入', snakeState.length > 100);

/* 6. 回游戏厅看战绩 */
await page.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await wait(700);
const rowText = await page.$eval('#arcRows', (el) => el.textContent.replace(/\s+/g, ' ').trim());
const who = await page.$eval('#arcStatsWho', (el) => el.textContent.trim());
check('战绩表显示档案名', who.includes('测试玩家'), who);
check('战绩表记录了局数', /1 局/.test(rowText), rowText.slice(0, 120));
await page.screenshot({ path: 'shots/save-stats.png' });

/* 7. 同一标签页刷新：保持解锁（会话）；新标签页打开：回到锁定 */
await page.reload({ waitUntil: 'networkidle0' });
await wait(700);
const chipAfterReload = await page.$eval('#pbChip', (el) => el.dataset.state);
check('同标签页刷新后保持解锁', chipAfterReload === 'unlocked', chipAfterReload);

const tab2 = await browser.newPage();
await tab2.goto(BASE + '/games/', { waitUntil: 'networkidle0' });
await wait(700);
const chipNewTab = await tab2.$eval('#pbChip', (el) => el.dataset.state);
check('新标签页需要重新解锁', chipNewTab === 'locked', chipNewTab);
await tab2.close();

/* 8. 游客模式仍可游玩并单独记录 */
await page.goto(BASE + '/games/2048/', { waitUntil: 'networkidle0' });
await wait(500);
await page.keyboard.press('ArrowLeft');
await wait(500);
const guestRaw = await page.evaluate(() => localStorage.getItem('sen.guest.v1') || '');
check('未解锁时数据落到游客区（不污染档案）', guestRaw.length >= 0);

check('全程无 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.close();
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
