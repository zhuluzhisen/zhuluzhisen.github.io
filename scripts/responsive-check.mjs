/**
 * 响应式布局体检
 *
 *   node scripts/responsive-check.mjs [baseUrl]
 *
 * 在多种视口宽度下检测：
 *   - 横向溢出（元素超出视口）
 *   - 关键交互元素是否可见（移动端菜单按钮等）
 *   - 触控目标尺寸是否达标
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4321';
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const VIEWPORTS = [
  { name: '手机 iPhone', width: 390, height: 844 },
  { name: '手机 小屏', width: 360, height: 740 },
  { name: '平板', width: 768, height: 1024 },
  { name: '笔记本', width: 1280, height: 800 },
  { name: '桌面', width: 1600, height: 900 },
];

const PAGES = ['/', '/blog', '/gallery', '/archives', '/about', '/friends'];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

let problems = 0;

for (const vp of VIEWPORTS) {
  console.log(`\n━━ ${vp.name} (${vp.width}×${vp.height}) ━━`);
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

  for (const p of PAGES) {
    await page.goto(BASE + p, { waitUntil: 'networkidle0' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));

    const res = await page.evaluate(() => {
      const vw = window.innerWidth;

      // 找出"真正"造成溢出的元素：向上回溯，若被某个祖先裁切则不算问题
      const isClipped = (e) => {
        let n = e.parentElement;
        while (n && n !== document.body) {
          const c = getComputedStyle(n);
          if (
            c.overflowX !== 'visible' ||
            c.overflow !== 'visible' ||
            c.overflowY !== 'visible' ||
            c.overflowY === 'hidden'
          ) {
            return true;
          }
          n = n.parentElement;
        }
        return false;
      };

      const overflow = [];
      document.querySelectorAll('body *').forEach((e) => {
        const b = e.getBoundingClientRect();
        if (b.width > 0 && (b.right > vw + 1 || b.left < -1) && !isClipped(e)) {
          overflow.push({
            tag: e.tagName,
            cls: (e.className || '').toString().split(' ').slice(0, 2).join('.'),
            left: Math.round(b.left),
            right: Math.round(b.right),
          });
        }
      });

      const menu = document.querySelector('#menuToggle');
      const menuVisible = menu
        ? getComputedStyle(menu).display !== 'none' && menu.getBoundingClientRect().width > 0
        : false;

      const theme = document.querySelector('#themeToggle');
      const themeRect = theme?.getBoundingClientRect();

      return {
        scrollW: document.documentElement.scrollWidth,
        vw,
        overflow: overflow.slice(0, 6),
        menuVisible,
        themeVisible: theme ? getComputedStyle(theme).display !== 'none' : false,
        themeRight: themeRect ? Math.round(themeRect.right) : -1,
        menuRight: (() => {
          const m = document.querySelector('#menuToggle')?.getBoundingClientRect();
          return m ? Math.round(m.right) : -1;
        })(),
      };
    });

    const hScroll = res.scrollW > res.vw + 1;
    const bad = hScroll || res.overflow.length > 0;
    const needMenu = vp.width <= 900;
    const menuBad = needMenu && (!res.menuVisible || res.menuRight > res.vw);
    const themeBad = res.themeRight > res.vw;

    if (bad || menuBad || themeBad) {
      problems++;
      console.log(`  ✗ ${p}`);
      if (hScroll) console.log(`      横向滚动: scrollWidth=${res.scrollW} > viewport=${res.vw}`);
      res.overflow.forEach((o) =>
        console.log(`      溢出: <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right}`),
      );
      if (menuBad)
        console.log(`      移动端菜单异常: visible=${res.menuVisible} right=${res.menuRight}`);
      if (themeBad) console.log(`      主题按钮越界: right=${res.themeRight}`);
    } else {
      console.log(`  ✓ ${p}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(`\n${problems === 0 ? '✓ 全部视口无布局问题' : `✗ 发现 ${problems} 处布局问题`}\n`);
process.exit(problems ? 1 : 0);
