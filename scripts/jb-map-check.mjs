// 校验 jingbian.astro 里九张地图：每行必须等长（20），且每张 11 行
import fs from 'node:fs';

const src = fs.readFileSync('src/pages/games/jingbian.astro', 'utf8');
const re = /rows: \[([\s\S]*?)\],/g;
let m;
let idx = 0;
let bad = 0;
while ((m = re.exec(src))) {
  idx += 1;
  const rows = [...m[1].matchAll(/'([^']*)'/g)].map((r) => r[1]);
  const lens = [...new Set(rows.map((r) => r.length))];
  const ok = lens.length === 1 && lens[0] === 20 && rows.length === 11;
  if (!ok) {
    bad += 1;
    console.log(`地图 #${idx} 有问题：${rows.length} 行，行宽 ${JSON.stringify(lens)}`);
    rows.forEach((r, i) => {
      if (r.length !== 20) console.log(`  行${i} (${r.length}): ${r}`);
    });
  } else {
    console.log(`地图 #${idx} OK — ${rows.length} 行 × ${lens[0]} 列`);
  }
}
console.log(bad === 0 ? `\n全部 ${idx} 张地图通过` : `\n有 ${bad} 张不通过`);
process.exit(bad === 0 ? 0 : 1);
