/**
 * 从 .docx 抽纯文本（零依赖：自己解 zip + 读 word/document.xml）
 * 用法：node scripts/docx-text.mjs 文件1.docx [文件2.docx ...]
 * 产出：同目录同名 .txt
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是 zip：' + file);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(start, start + compSize);
    entries[name] = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlToText(xml) {
  let out = '';
  for (const p of xml.split(/<\/w:p>/g)) {
    let line = '';
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = re.exec(p))) {
      line += m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
    }
    line = line.trim();
    if (!line) continue;
    out += (/<w:pStyle[^>]*w:val="(Heading|标题|[1-6])/.test(p) ? '\n## ' : '') + line + '\n';
  }
  return out;
}

for (const f of process.argv.slice(2)) {
  const entries = readZip(f);
  const doc = entries['word/document.xml'];
  if (!doc) {
    console.error('缺 document.xml：' + f);
    continue;
  }
  const text = xmlToText(doc.toString('utf8'));
  const outName = path.join(path.dirname(f), path.basename(f, '.docx') + '.txt');
  fs.writeFileSync(outName, text, 'utf8');
  console.log(`${outName} → ${text.length} 字`);
}
