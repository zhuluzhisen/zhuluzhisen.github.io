/**
 * 《惊变一百天 · 隔离》冒烟测试
 *   直接读游戏内 __jb.exits / __jb.foes 的真实坐标，不手写格子号，避免对不上。
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
  } catch {
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
await page.goto(BASE + '/games/jingbian', { waitUntil: 'networkidle0' });
await wait(700);
await page.screenshot({ path: 'shots/jb-01-title.png' });

const report = [];
const log = (...a) => {
  const line = a.join(' ');
  report.push(line);
  console.log(line);
};

async function state() {
  return page.evaluate(() => ({
    scene: window.__jb?.scene,
    phase: window.__jb?.phase,
    player: window.__jb?.player,
    bag: window.__jb?.bag,
    foes: window.__jb?.foes,
    exits: window.__jb?.exits,
    dialog: window.__jb?.dialog,
    prog: document.getElementById('jbProg')?.textContent,
    clock: document.getElementById('jbClock')?.textContent,
    goal: document.getElementById('jbGoal')?.textContent,
    overlayHidden: document.getElementById('jbOverlay')?.hidden,
  }));
}

async function clearDialog(max = 60) {
  for (let i = 0; i < max; i++) {
    const hidden = await page.evaluate(() => document.getElementById('jbDialog')?.hidden);
    if (hidden) return true;
    await page.keyboard.press('Space');
    await wait(130);
  }
  return false;
}

async function tp(tx, ty) {
  await page.evaluate((x, y) => window.__jb?.tp(x, y), tx, ty);
  await wait(380);
}

async function snap(name) {
  const data = await page.evaluate(() => {
    const c = document.querySelector('#jbCanvas');
    const big = document.createElement('canvas');
    big.width = c.width * 4;
    big.height = c.height * 4;
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(c, 0, 0, big.width, big.height);
    return big.toDataURL('image/png');
  });
  fs.writeFileSync(`shots/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
}

/** 走到当前场景的出口，返回新场景名 */
async function passGate(label) {
  const s0 = await state();
  const ex = s0.exits?.[0];
  if (!ex) {
    log(label, '没有出口');
    return null;
  }
  await tp(Math.floor(ex.x / 16), Math.floor(ex.y / 16));
  await wait(500);
  const s1 = await state();
  log(label, `${s0.scene} → ${s1.scene}`, '| clock =', s1.clock, '| prog =', s1.prog);
  return s1;
}

// ---- 开局 ----
await page.click('#jbBtn');
await wait(500);
await clearDialog();
let s = await state();
log('开局 scene =', s.scene, '| prog =', s.prog, '| clock =', s.clock, '| goal =', s.goal);
await snap('jb-02-home');

// ---- 真实按键：移动 + 顶墙 ----
const b0 = (await state()).player;
await page.keyboard.down('d');
await wait(400);
await page.keyboard.up('d');
await wait(150);
const b1 = (await state()).player;
log('按住 D 400ms，dx =', b1.x - b0.x, 'dy =', b1.y - b0.y);

await tp(3, 1);
await page.keyboard.down('w');
await wait(600);
await page.keyboard.up('w');
const b2 = (await state()).player;
log('顶住上墙，y 收敛到', b2.y, '（16px 格：24 即脚贴墙面，未穿墙）');

// ---- 口罩 ----
await tp(13, 8);
await wait(400);
await clearDialog();
s = await state();
log('拾取口罩 bag =', JSON.stringify(s.bag));
await page.keyboard.press('m');
await wait(300);
s = await state();
log('按 M 戴上 =', JSON.stringify(s.bag));

// ---- 1 → 2 ----
await passGate('场景1→2');
await clearDialog();
await snap('jb-03-gate');

// ---- 2 → 3 ----
await passGate('场景2→3');
await clearDialog();
await snap('jb-04-bus');

// ---- 公交：贴咳嗽者看暴露度 ----
const cg = (await state()).foes.find((f) => f.kind === 'cougher');
let exposedBefore = (await state()).player.exposure;
if (cg) {
  await tp(Math.floor(cg.x / 16), Math.floor(cg.y / 16) + 1);
  await wait(1500);
  s = await state();
  log(`在咳嗽者旁边站 1.5s：暴露 ${exposedBefore} → ${s.player.exposure}（戴口罩 ${s.bag.on ? '开' : '关'}）`);
} else {
  log('公交里没找到咳嗽者');
}
await snap('jb-05-bus-inside');

// ---- 3 → 4 办公区 ----
await passGate('场景3→4');
await clearDialog();
await snap('jb-06-office');

// 两个路人
for (const [x, y] of [
  [8, 5],
  [15, 8],
]) {
  await tp(x, y);
  await clearDialog();
  await wait(200);
}
await passGate('场景4→5');
await clearDialog();
await snap('jb-07-client');

// ---- 5 → 6 大堂 ----
await passGate('场景5→6');
await clearDialog();
await snap('jb-08-lobby');

// ---- 大堂门禁：周凯没倒之前不放行 ----
const gateBefore = await state();
await page.evaluate(() => window.__jb?.tp(18, 9));
await wait(900);
s = await state();
log('周凯未倒时走到出口 → scene =', s.scene, '（应仍为 lobby，被拦下）');
void gateBefore;

// ---- 推开周凯 ----
let swings = 0;
for (let i = 0; i < 30; i++) {
  s = await state();
  const z = s.foes.find((f) => f.kind === 'brute' && !f.dead);
  if (!z) break;
  const tx = Math.floor(z.x / 16);
  const ty = Math.floor((z.y + 2) / 16);
  await page.evaluate((a, b) => window.__jb?.tp(a, b), tx, Math.max(1, ty - 1));
  await wait(110);
  await page.keyboard.press('Space');
  swings += 1;
  await wait(300);
}
await clearDialog();
s = await state();
log('挥了', swings, '次，周凯 =', JSON.stringify(s.foes.filter((f) => f.kind === 'brute')));
log('此时体力 =', Math.round(s.player.hp), '| 暴露 =', s.player.exposure);
await snap('jb-09-lobby-fight');

await passGate('场景6→7');
await clearDialog();
await snap('jb-10-market');

// ---- 收物资 ----
const picks = [
  [4, 3],
  [11, 3],
  [7, 5],
  [14, 6],
];
await clearDialog();
for (const [x, y] of picks) {
  await tp(x, y);
  await wait(320);
}
s = await state();
log('收完 4 件物资 bag =', JSON.stringify(s.bag));

await page.evaluate(() => window.__jb?.killAll());
await wait(300);
await passGate('场景7→8');
await clearDialog();
await snap('jb-11-court');

await page.evaluate(() => window.__jb?.killAll());
await wait(300);
await passGate('场景8→9');
const endDialogOk = await clearDialog(80);
await wait(800);
s = await state();
log('结局：对话清完 =', endDialogOk, '| phase =', s.phase, '| 遮罩显示 =', !s.overlayHidden);
await snap('jb-12-ending');
await page.screenshot({ path: 'shots/jb-13-clear.png' });

// ---- 游戏厅卡片 ----
const arc = await browser.newPage();
await arc.setViewport({ width: 1440, height: 1500, deviceScaleFactor: 1 });
await arc.goto(BASE + '/games', { waitUntil: 'networkidle0' });
await wait(900);
await arc.screenshot({ path: 'shots/jb-14-arcade.png', fullPage: true });
const card = await arc.evaluate(() => {
  const a = document.querySelector('a[href="/games/jingbian"]');
  if (!a) return '没有卡片';
  const svg = a.querySelector('svg');
  const r = svg?.getBoundingClientRect();
  return svg ? `卡片 OK，缩略图 ${Math.round(r.width)}×${Math.round(r.height)}` : '卡片缺缩略图';
});
log('游戏厅 =', card);

log('errors =', errors.length);
errors.slice(0, 10).forEach((e) => log('  ' + e));

await browser.close();
server.close();
fs.writeFileSync('shots/jb-report.txt', report.join('\n'), 'utf8');
process.exit(errors.length ? 1 : 0);
