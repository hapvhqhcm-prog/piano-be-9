#!/usr/bin/env node
/**
 * Kiểm tra tương thích iPad cũ (Safari / iPadOS 15.0+). Chạy SAU `npm run build`.
 *
 * 1. Cú pháp trong dist/ (assets/*.js + sw.js): esbuild minify cùng một mã với target 'esnext' và 'safari15'.
 *    Nếu hai kết quả khác nhau → trong bundle còn cú pháp Safari 15 phải "hạ cấp" (class static block,
 *    regex lookbehind/(?<…)… , v.v.) → FAIL. (esbuild biến regex không hỗ trợ thành `new RegExp(...)`
 *    — vẫn ném lỗi lúc chạy trên Safari cũ — nên khác biệt này bắt được cả lỗi regex.)
 * 2. API mới hơn Safari 15.0 trong dist/ (không hạ cấp được): .at(), findLast, structuredClone, Object.hasOwn …
 *    → FAIL nếu xuất hiện.
 * 3. API cần kiểm tra trước khi dùng trong src/ (audioSession, AudioWorklet, wakeLock …): dòng dùng phải có
 *    `typeof` / `?.` / `in ` hoặc chú thích `compat-ok` → không thì FAIL.
 * 4. CSS dist: cảnh báo (không FAIL) các tính năng Safari 15.0 bỏ qua — phải có dự phòng.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { transformSync } from 'esbuild';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const errors = [];
const warnings = [];

if (!existsSync(dist)) {
  console.error('compat-check: chưa có dist/ — chạy `npm run build` trước.');
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const distFiles = walk(dist);
const jsFiles = distFiles.filter((f) => f.endsWith('.js'));
const cssFiles = distFiles.filter((f) => f.endsWith('.css'));

/** API không hạ cấp được, ra đời sau Safari 15.0. [mẫu, tên, Safari tối thiểu] */
const JS_API_DENY = [
  [/\.at\(\s*-?[\w$.]/, 'Array/String.prototype.at()', '15.4'],
  [/\.findLast(Index)?\(/, 'findLast / findLastIndex', '15.4'],
  [/\bstructuredClone\(/, 'structuredClone', '15.4'],
  [/\bObject\.hasOwn\(/, 'Object.hasOwn', '15.4'],
  [/\.randomUUID\(/, 'crypto.randomUUID', '15.4'],
  [/\bAbortSignal\.timeout\(/, 'AbortSignal.timeout', '16'],
  [/\bAbortSignal\.any\(/, 'AbortSignal.any', '17.4'],
  [/\bnew BroadcastChannel\(/, 'BroadcastChannel', '15.4'],
  [/\bIntl\.Segmenter\b/, 'Intl.Segmenter', '14.1 (ok) — kiểm tra lại'],
  [/\.(toSorted|toReversed|toSpliced)\(/, 'Array change-by-copy', '16'],
  [/\b(Object|Map)\.groupBy\(/, 'Object/Map.groupBy', '17.4'],
  [/\bArray\.fromAsync\(/, 'Array.fromAsync', '16.4'],
  [/\bPromise\.withResolvers\(/, 'Promise.withResolvers', '17.4'],
  [/\.showModal\(/, '<dialog>.showModal', '15.4'],
  [/\(\?<[=!]/, 'RegExp lookbehind', '16.4'],
];

// ---- 1 + 2: dist JS ----
for (const file of jsFiles) {
  const rel = relative(root, file).split('\\').join('/');
  const code = readFileSync(file, 'utf8');
  const opts = { loader: 'js', minify: true, format: rel.endsWith('sw.js') ? undefined : 'esm', logLevel: 'silent' };
  let a = '';
  let b = '';
  try {
    a = transformSync(code, { ...opts, target: 'esnext' }).code;
  } catch (e) {
    errors.push(`${rel}: esbuild không đọc được (${e.message.split('\n')[0]})`);
    continue;
  }
  try {
    b = transformSync(code, { ...opts, target: 'safari15' }).code;
  } catch (e) {
    errors.push(`${rel}: có cú pháp Safari 15 không hỗ trợ và không hạ cấp được — ${e.message.split('\n')[0]}`);
    continue;
  }
  if (a !== b) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    errors.push(
      `${rel}: còn cú pháp mới hơn Safari 15 (esbuild phải hạ cấp). Quanh vị trí ${i}:\n` +
        `    esnext  : …${a.slice(Math.max(0, i - 60), i + 80)}…\n` +
        `    safari15: …${b.slice(Math.max(0, i - 60), i + 80)}…`,
    );
  }
  for (const [re, name, ver] of JS_API_DENY) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(code))) {
      errors.push(`${rel}: ${name} (Safari ${ver}) — …${code.slice(Math.max(0, m.index - 50), m.index + 50)}…`);
      if (g.lastIndex === m.index) g.lastIndex++;
    }
  }
}

// ---- 3: src — API phải có kiểm tra tính năng ----
const GUARDED = [
  [/\baudioSession\b/, 'navigator.audioSession (16.4)'],
  [/\baudioWorklet\b|\bAudioWorkletNode\b/, 'AudioWorklet (14.1, iOS hay lỗi)'],
  [/\bwakeLock\b/, 'navigator.wakeLock (16.4)'],
  [/\bcanShare\b/, 'navigator.canShare (15 — files)'],
  [/\bstorage\.persist(ed)?\b/, 'navigator.storage.persist (15.2)'],
  [/\brequestIdleCallback\b/, 'requestIdleCallback (không có trên Safari)'],
  [/\bOffscreenCanvas\b/, 'OffscreenCanvas (16.4)'],
  [/\bcreateImageBitmap\b/, 'createImageBitmap (15)'],
  [/\bshowPicker\(/, 'input.showPicker (16)'],
  [/\bscheduler\.(postTask|yield)\b/, 'scheduler (không có trên Safari)'],
  [/\bnavigator\.vibrate\b/, 'navigator.vibrate (không có trên iOS)'],
];
const GUARD_HINT = /typeof\b|\?\.|\b[\w$]+\?\s*:|\bin\s|compat-ok|^\s*(\*|\/\/|\/\*)|\binterface\b|^\s*[\w$]+\??\s*:/;
const srcFiles = walk(join(root, 'src')).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'));
for (const file of srcFiles) {
  const rel = relative(root, file).split('\\').join('/');
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [re, name] of GUARDED) {
      if (!re.test(line)) continue;
      // chấp nhận nếu chính dòng đó, hoặc 3 dòng phía trên, có dấu hiệu kiểm tra tính năng
      const ctx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (!GUARD_HINT.test(line) && !/typeof\b|\?\.|compat-ok/.test(ctx)) {
        errors.push(`${rel}:${i + 1}: ${name} dùng không kiểm tra tính năng — ${line.trim()}`);
      }
    }
    for (const [re, name, ver] of JS_API_DENY) {
      if (re.test(line) && !/compat-ok/.test(line) && !/^\s*(\*|\/\/)/.test(line)) {
        errors.push(`${rel}:${i + 1}: ${name} (Safari ${ver}) — ${line.trim()}`);
      }
    }
  });
}

// ---- 4: CSS (chỉ cảnh báo) ----
const CSS_WARN = [
  [/:has\(/, ':has() (15.4)'],
  [/@container|container-type/, 'container queries (16)'],
  [/color-mix\(/, 'color-mix() (16.2)'],
  [/@layer\b/, '@layer (15.4) — cả khối bị bỏ trên 15.0'],
  [/\b\d*\.?\d+(dvh|svh|lvh|dvw|svw|lvw)\b/, 'dvh/svh (15.4)'],
  [/text-wrap\s*:/, 'text-wrap (17.5)'],
  [/\boklch\(|\boklab\(|\blch\(/, 'oklch/lch (15.4)'],
  [/accent-color\s*:/, 'accent-color (15.4)'],
  [/scrollbar-gutter/, 'scrollbar-gutter (17)'],
];
for (const file of cssFiles) {
  const rel = relative(root, file).split('\\').join('/');
  const css = readFileSync(file, 'utf8');
  for (const [re, name] of CSS_WARN) if (re.test(css)) warnings.push(`${rel}: ${name} — cần dự phòng cho Safari 15.0`);
  // Danh sách selector trộn :focus-visible với selector khác → Safari < 15.4 bỏ CẢ quy tắc
  for (const m of css.matchAll(/([^{}]*):focus-visible([^{}]*)\{/g)) {
    const sel = m[0];
    if (sel.split(',').some((s) => !s.includes(':focus-visible'))) {
      errors.push(`${rel}: :focus-visible trộn chung danh sách selector (Safari < 15.4 bỏ cả quy tắc) — ${sel.trim().slice(0, 120)}`);
    }
  }
}

for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  console.error(`\ncompat-check: ${errors.length} lỗi tương thích Safari/iPadOS 15.`);
  process.exit(1);
}
console.log(`compat-check OK — ${jsFiles.length} file JS, ${cssFiles.length} file CSS, ${srcFiles.length} file src; mục tiêu Safari/iPadOS 15.0+.`);
