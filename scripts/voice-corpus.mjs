// Gom các câu app có thể đọc → voice/corpus.txt (mỗi dòng một câu, đã qua speakable + tách câu).
// Nguồn: (1) chuỗi tiếng Việt trong src/ có dấu kết câu (. ! ? …), (2) các lời đã nghe được khi chạy thử
// (voice/harvest/*.json — scripts/e2e.mjs ghi khi đặt VOICE_HARVEST=1). Chạy: npx vite-node scripts/voice-corpus.mjs
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { speakable } from '../src/audio/voice.ts';
import { splitSentences, normSentence } from '../src/audio/voiceClips.ts';

const ROOT = process.cwd();
const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Chuỗi trong mã: '...', "...", `...` (phần chữ giữa các ${}). Bỏ chú thích. */
function literals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') {
          s += src[j + 1] === 'n' ? ' ' : src[j + 1];
          j += 2;
          continue;
        }
        s += src[j++];
      }
      out.push(s);
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let s = '';
      let depth = 0;
      while (j < n) {
        if (depth === 0 && src[j] === '`') break;
        if (src[j] === '\\') {
          if (depth === 0) s += src[j + 1];
          j += 2;
          continue;
        }
        if (depth === 0 && src[j] === '$' && src[j + 1] === '{') {
          out.push(s);
          s = '';
          depth = 1;
          j += 2;
          continue;
        }
        if (depth > 0) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          j++;
          continue;
        }
        s += src[j++];
      }
      out.push(s);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

const sentences = new Map(); // câu → nguồn
const add = (text, from) => {
  const line = speakable(text);
  for (const s of splitSentences(line)) {
    const k = normSentence(s);
    if (!VI.test(k) || k.length < 2 || k.length > 400) continue;
    if (!sentences.has(k)) sentences.set(k, from);
  }
};

// (1) chuỗi trong mã có dáng câu nói: tiếng Việt, ≥ 2 từ, có dấu kết câu
for (const f of walk(join(ROOT, 'src'))) {
  if (/[\\/](pwa|progress)[\\/]/.test(f)) continue; // nhật ký thay đổi, sao lưu… không đọc to
  for (const s of literals(readFileSync(f, 'utf8'))) {
    const t = s.trim();
    if (!VI.test(t) || t.split(/\s+/).length < 2) continue;
    if (!/[.!?…]/.test(t)) continue;
    add(t, 'src');
  }
}
// (2) lời nghe được khi chạy thử
const hv = join(ROOT, 'voice', 'harvest');
let harvested = 0;
if (existsSync(hv))
  for (const n of readdirSync(hv))
    if (n.endsWith('.json'))
      for (const line of JSON.parse(readFileSync(join(hv, n), 'utf8'))) {
        harvested++;
        add(line, 'run');
      }

mkdirSync(join(ROOT, 'voice'), { recursive: true });
const list = [...sentences.keys()].sort();
writeFileSync(join(ROOT, 'voice', 'corpus.txt'), list.join('\n') + '\n');
const fromRun = [...sentences.values()].filter((v) => v === 'run').length;
console.log(`${list.length} câu (${fromRun} chỉ có khi chạy thử, từ ${harvested} lời) → voice/corpus.txt`);
