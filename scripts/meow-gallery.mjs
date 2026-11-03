/**
 * 《喵星防线》图鉴截图：借 dev 服务直接加载源码模块，把所有气球和满级猫猫摆上场
 *   npx astro dev --port 4391  （另开一个终端）
 *   node scripts/meow-gallery.mjs
 * 输出 shots/meow-gallery.png（全场）和 shots/meow-gallery-zoom.png（局部放大）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:4391';
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${BASE}/games/meow`, { waitUntil: 'networkidle0' });

await page.evaluate(async () => {
  const { MeowGame } = await import('/src/games/meow/engine.ts');
  const { MAPS } = await import('/src/games/meow/maps.ts');
  const { PixiView } = await import('/src/games/meow/pixi-view.ts');

  const game = new MeowGame(MAPS[0]);
  game.money = 1e6;
  const types = ['red', 'blue', 'green', 'yellow', 'pink', 'black', 'white', 'lead', 'zebra', 'rainbow', 'ceramic'];
  types.forEach((t, i) => game.spawn(t, 60 + i * 40, false));
  game.spawn('rainbow', 620, true);
  game.spawn('pink', 665, false).frozen = 5;
  game.spawn('ceramic', 710, false).hp = 3;
  game.spawn('boss', 1000, false).hp *= 0.6;
  game.spawn('boss', 1500, false);

  const towers = [
    ['claw', 130, 160, [3, 2]],
    ['yarn', 270, 330, [2, 3]],
    ['snipe', 430, 210, [3, 2]],
    ['ice', 600, 300, [2, 3]],
    ['super', 430, 300, [3, 2]],
  ];
  for (const [k, x, y, tiers] of towers) {
    const t = game.place(k, x, y);
    for (let p = 0; p < 2; p++) for (let i = 0; i < tiers[p]; i++) game.upgrade(t, p);
    t.ang = k === 'snipe' ? -0.4 : 0.6;
  }

  const c = document.createElement('canvas');
  c.id = 'gallery';
  c.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:520px;z-index:9999';
  document.body.appendChild(c);
  const view = await PixiView.create(c, 'high');
  const base = {
    hover: null,
    placing: null,
    placeOk: true,
    selected: game.towers[2],
    hoverTower: null,
    banner: { title: '第 28 波 / 30', sub: '鼠王飞艇来袭！', life: 1.5, max: 2.8 },
    speed: 3,
    hint: '',
  };
  // 先跑一秒让出生动画走完
  for (let i = 0; i < 60; i++) view.frame(game, { ...base, time: i / 60 }, 1 / 60);
  view.events([
    { k: 'boom', x: 300, y: 430, r: 50 },
    { k: 'pulse', x: 600, y: 300, r: 110 },
    { k: 'tracer', x1: 430, y1: 210, x2: 520, y2: 300 },
    { k: 'pop', x: 210, y: 250, t: 'pink' },
  ]);
  for (let i = 0; i < 6; i++) view.frame(game, { ...base, time: 1 + i / 60 }, 1 / 60);
});

const el = await page.$('#gallery');
await el.screenshot({ path: path.join(SHOTS, 'meow-gallery.png') });
await page.screenshot({ path: path.join(SHOTS, 'meow-gallery-zoom.png'), clip: { x: 90, y: 120, width: 420, height: 260 } });
console.log(errors.length ? `报错：\n${errors.join('\n')}` : '无报错');
await browser.close();
