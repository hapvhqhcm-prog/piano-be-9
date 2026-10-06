/**
 * KIỂM THỬ ĐẦU-CUỐI (E2E) trên BẢN BUILD THẬT — không cần cài thêm gói.
 *
 *   npm run e2e                     # build + chạy tất cả kịch bản
 *   node scripts/e2e.mjs --skip-build --only A,C
 *   node scripts/e2e.mjs --out D:\tmp\e2e-x --quick
 *
 * Cách chạy:
 *   1. `npm run build` (tsc + vite build → dist/), rồi `vite preview` ở cổng trống, base /piano-be-9/.
 *   2. Mở Edge chạy ngầm (cổng CDP riêng, hồ sơ tạm riêng), iPad ngang 1080×810, bật cảm ứng.
 *   3. Điều khiển UI THẬT qua Chrome DevTools Protocol: chạm nút bằng chuột giả lập (Input.dispatchMouseEvent)
 *      theo chữ trên nút / class CSS / data-*. KHÔNG dùng window.__piano (chỉ có ở bản dev).
 *   Micro tắt (mặc định) → luôn đi đường "bố mẹ": 👪 Đúng rồi, phiếu chấm (Đúng nốt/Đều nhịp/…), Bố mẹ: tiếp…
 *
 * Kịch bản:
 *   A  Lần đầu mở app → Bắt đầu → Hướng dẫn (4 thẻ) → màn chính → Học tiếp (tuần 1 bài 1) → tổng kết →
 *      màn chính có tiến độ → học hết tuần 1 (cả thử thách Đô giữa 10 lần) → lên Tuần 2.
 *   B  Cổng phụ huynh (nhấn giữ 2 giây + phép cộng) → chọn tuần 12, 18, 22, 28 → mỗi tuần một buổi "Học tiếp";
 *      thêm các bài có kiểu bước còn thiếu (phím đen, đối đáp, sáng tác, nốt mốc, to-nhỏ, ngắt-liền, đọc nhạc).
 *      (--quick: bỏ phần bổ sung)
 *   C  Thư viện → mở bài → Xem mẫu → quay lại; Sổ sticker; màn Phụ huynh (Nâng cao, Sao lưu không lỗi).
 *   D  PWA: service worker đang điều khiển trang → tắt mạng + tắt máy chủ → tải lại → app vẫn mở, dữ liệu còn.
 *   E  Cập nhật an toàn: phát bản mới (bản sao dist/ có sw.js + index.html khác) → giữa buổi học KHÔNG tải lại;
 *      về màn chính (điểm an toàn) → tự tải lại sang bản mới, dữ liệu còn nguyên.
 *
 * Kết quả: ảnh chụp từng bước, log, summary.json trong thư mục ra (mặc định <scratchpad>/e2e-N).
 * Mã thoát ≠ 0 nếu có kịch bản hỏng (lỗi console/exception/request hỏng ngoài dự kiến cũng tính là hỏng).
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/piano-be-9/';
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = Number(process.env.E2E_CDP_PORT ?? 9901);
const W = 1080;
const H = 810;

// ---------------- tham số ----------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ONLY = (opt('--only') ?? 'A,B,C,D,E').toUpperCase().split(',').map((s) => s.trim());
const SKIP_BUILD = flag('--skip-build');
const QUICK = flag('--quick');
const KEEP_PROFILE = flag('--keep-profile');
// --weeks 12,18 : tuần cho phần chính của kịch bản B (mặc định 12,18,22,28; "none" = bỏ)
const B_WEEKS = (opt('--weeks') ?? '12,18,22,28').split(',').map(Number).filter((n) => n >= 1);

function defaultOutRoot() {
  const scratch = 'C:\\Users\\Admin\\AppData\\Local\\Temp\\claude\\C--Users-Admin-Desktop\\f9a5e6cb-5b62-4383-9275-dbaf4ea4aaf4\\scratchpad';
  return process.env.E2E_OUT_ROOT ?? (existsSync(scratch) ? scratch : join(tmpdir(), 'piano-e2e'));
}
function nextOutDir() {
  const root = defaultOutRoot();
  mkdirSync(root, { recursive: true });
  let n = 1;
  const used = new Set(readdirSync(root).filter((x) => /^e2e-\d+$/.test(x)).map((x) => Number(x.slice(4))));
  while (used.has(n)) n++;
  return join(root, `e2e-${n}`);
}
const OUT = resolve(opt('--out') ?? nextOutDir());
mkdirSync(OUT, { recursive: true });

// ---------------- tiện ích ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const logLines = [];
function log(...a) {
  const line = `[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`;
  logLines.push(line);
  console.log(line);
  if (logLines.length % 20 === 0) writeFileSync(join(OUT, 'e2e.log'), logLines.join('\n'));
}
class Fail extends Error {}
function assert(cond, msg) {
  if (!cond) throw new Fail(msg);
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

function runBuild() {
  log('▶ npm run build');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, shell: true, encoding: 'utf8' });
  writeFileSync(join(OUT, 'build.log'), `${r.stdout}\n${r.stderr}`);
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error('Build hỏng — xem build.log');
  }
  log('  build xong');
}

const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
/** vite preview cho một thư mục build; trả về {proc, stop()} khi đã phục vụ được trang. */
async function startPreview(outDir, port) {
  const proc = spawn(
    process.execPath,
    [VITE, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--base', BASE, '--outDir', outDir],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (out += d));
  const url = `http://127.0.0.1:${port}${BASE}`;
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error(`vite preview thoát sớm:\n${out}`);
    try {
      const r = await fetch(url);
      if (r.ok) break;
    } catch {
      /* chưa sẵn sàng */
    }
    await sleep(150);
  }
  log(`  vite preview ${outDir} → ${url}`);
  return {
    proc,
    url,
    stop: async () => {
      if (proc.exitCode === null) {
        proc.kill();
        for (let i = 0; i < 40 && proc.exitCode === null; i++) await sleep(50);
      }
      // chờ cổng được nhả
      for (let i = 0; i < 40; i++) {
        try {
          await fetch(url);
        } catch {
          break;
        }
        await sleep(100);
      }
    },
  };
}

// ---------------- CDP ----------------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      } else if (m.method) {
        for (const fn of this.handlers.get(m.method) ?? []) fn(m.params);
      }
    });
  }
  send(method, params = {}, timeoutMs = 60_000) {
    return new Promise((res, rej) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        if (m.error) rej(new Error(`${method}: ${m.error.message}`));
        else res(m.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

// ---------------- ghi nhận lỗi ----------------
let currentScenario = 'setup';
/** Trong kịch bản offline: request hỏng là dự kiến */
let expectNetFailures = false;
const problems = []; // { scenario, kind, text, expected }
const consoleWarnings = [];
const IGNORE_CONSOLE = [
  // Edge headless không có loa/thiết bị micro thật — không phải lỗi của app
];
function addProblem(kind, text, extra = {}) {
  if (IGNORE_CONSOLE.some((re) => re.test(text))) return;
  const p = { scenario: currentScenario, kind, text: text.slice(0, 600), ...extra };
  problems.push(p);
  log(`  ⚠ [${kind}] ${p.text.split('\n')[0]}${p.expected ? ' (dự kiến)' : ''}`);
}

// ---------------- Edge ----------------
const profile = mkdtempSync(join(tmpdir(), 'piano-e2e-profile-'));
let edge = null;
let cdp = null;
let preview = null;
let appPort = 0;
let APP_URL = '';

async function launchEdge() {
  edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    // Đồng hồ AudioContext chạy (app hẹn giờ theo nó) mà KHÔNG phát ra loa của máy chạy kiểm thử
    '--disable-audio-output',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-features=msEdgeRewards,EdgeCollections',
    `--window-size=${W},${H}`,
    'about:blank',
  ]);
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
    } catch {
      /* Edge chưa sẵn sàng */
    }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error(`Không kết nối được Edge ở cổng ${CDP_PORT}`);
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.addEventListener('open', r, { once: true });
    ws.addEventListener('error', j, { once: true });
  });
  cdp = new CDP(ws);

  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    if (p.type === 'error' || p.type === 'assert') addProblem('console.error', text);
    else if (p.type === 'warning') {
      consoleWarnings.push({ scenario: currentScenario, text });
      log(`  · console.warn: ${text.slice(0, 200)}`);
    }
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    addProblem('exception', `${d.exception?.description ?? d.text} @ ${d.url ?? ''}:${d.lineNumber ?? ''}`);
  });
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error') {
      // Lỗi tải tài nguyên lúc offline đã được Network ghi; còn lại là lỗi thật
      const expected = expectNetFailures && entry.source === 'network';
      addProblem('log.error', `${entry.source}: ${entry.text} ${entry.url ?? ''}`, { expected });
    } else if (entry.level === 'warning') consoleWarnings.push({ scenario: currentScenario, text: `${entry.source}: ${entry.text}` });
  });
  const reqUrls = new Map();
  cdp.on('Network.requestWillBeSent', (p) => reqUrls.set(p.requestId, p.request.url));
  cdp.on('Network.loadingFailed', (p) => {
    if (p.canceled) return;
    const url = reqUrls.get(p.requestId) ?? '?';
    addProblem('net.failed', `${p.errorText} ${url}`, { expected: expectNetFailures });
  });
  cdp.on('Network.responseReceived', (p) => {
    if (p.response.status >= 400) addProblem('net.status', `${p.response.status} ${p.response.url}`, { expected: expectNetFailures });
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: join(OUT, 'downloads') }).catch(() => undefined);
}

async function evaluate(expr, timeoutMs = 30_000) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, timeoutMs);
  if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

let shotNo = 0;
async function shot(name, jpeg = false) {
  shotNo++;
  const safe = `${String(shotNo).padStart(3, '0')}-${currentScenario}-${name}`.replace(/[^\w.\-]+/g, '_').slice(0, 90);
  try {
    const r = await cdp.send(
      'Page.captureScreenshot',
      jpeg ? { format: 'jpeg', quality: 60 } : { format: 'png' },
      20_000,
    );
    writeFileSync(join(OUT, `${safe}.${jpeg ? 'jpg' : 'png'}`), Buffer.from(r.data, 'base64'));
  } catch (e) {
    log(`  (không chụp được ảnh ${name}: ${e.message})`);
  }
}

// ---------------- thư viện chạy TRONG trang ----------------
/**
 * Các hàm tiện ích (chuỗi JS) dùng trong mọi Runtime.evaluate: tìm nút theo chữ, phân loại màn hình,
 * và "lái tự động" một buổi học (decide). Không đụng vào mã app — chỉ đọc DOM.
 */
const LIB = String.raw`
const vis = (el) => {
  if (!el || !el.isConnected) return false;
  if (el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
};
const txt = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const label = (b) => txt(b.querySelector('.btn-label') ?? b);
const buttons = () => [...document.querySelectorAll('button')].filter((b) => vis(b) && !b.disabled);
const btn = (l) => buttons().find((b) => label(b) === l);
const btnStarts = (l) => buttons().find((b) => label(b).startsWith(l));
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (p) => {
  const m = /^([A-G])([#b♯♭]?)(-?\d)$/.exec(String(p));
  if (!m) return NaN;
  return (Number(m[3]) + 1) * 12 + NAMES[m[1]] + (m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0);
};
const diat = (p) => {
  const m = /^([A-G])[#b♯♭]?(-?\d)$/.exec(String(p));
  return m ? Number(m[2]) * 7 + 'CDEFGAB'.indexOf(m[1]) : NaN;
};
const keyFor = (p) => [...document.querySelectorAll('.key[data-pitch]')].find((k) => midi(k.dataset.pitch) === midi(p) && vis(k));
let __mark = 0;
const target = (el, what) => {
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  // phím đen: chạm gần đầu phím; phím trắng: phần dưới (tránh phím đen đè lên)
  const isKey = el.classList.contains('key');
  const black = el.classList.contains('key-black');
  const x = r.left + r.width / 2;
  const y = isKey ? r.top + r.height * (black ? 0.5 : 0.85) : r.top + r.height / 2;
  const id = 'e' + Date.now().toString(36) + (++__mark);
  el.setAttribute('data-e2e-target', id);
  const hit = document.elementFromPoint(x, y);
  return { x, y, what, id, blocked: !(hit && (hit === el || el.contains(hit))) , hit: hit ? (hit.className?.baseVal ?? hit.className ?? hit.tagName) + '' : null };
};
const screenKind = () => {
  const q = (s) => document.querySelector(s);
  const title = txt(q('.stage .title, h1.title, .hero-title'));
  if (q('.screen.home')) return 'home';
  if (q('.screen.onboarding')) return 'onboarding';
  if (q('.dialog-backdrop')) return 'dialog';
  if (q('.gate-q')) return 'parent-gate';
  if (q('.parent-head')) return 'parent';
  if (q('.screen.stickers')) return 'stickers';
  if (q('.end-actions')) return 'session-end';
  if (q('.rating-options') || title.startsWith('Hôm nay con thấy')) return 'rating';
  if (txt(q('.step-tag')) === 'Con làm thầy') return 'teach';
  if (txt(q('.step-tag')).startsWith('Tư thế')) return 'posture';
  if (q('.iv-stage')) return 'improv:' + ((q('.iv-stage').className.match(/iv-(black-keys|question-answer|compose)/) || [])[1] || '?');
  if (q('.tq-art-box, .tq-list, .tq-timer')) return 'technique';
  if (q('.dyn-pair, .dyn-card')) return 'dynamics';
  if (q('.rh-how')) return 'rhythm';
  if (q('.song-head') && /Ôn bài cũ/.test(txt(q('.song-status')))) return 'review-song';
  if (q('.song-head')) return q('.song-head .song-title') && /\(\d+\/\d+\)/.test(txt(q('.song-title'))) ? 'sight' : 'song';
  if (q('.iv-answers')) return 'quiz:interval';
  if (q('.lm-choices') || title === 'Nốt mốc nào đây?') return 'quiz:landmark';
  if (title === 'Nốt này là nốt gì?') return 'quiz:read';
  if (q('.choice-row')) return 'quiz:choice';
  if (txt(q('.step-tag')) === 'Trò chơi' || /^Nốt nào đây|^Nghe các nốt|^Con đúng \d+ \/ \d+/.test(title)) return 'quiz';
  if (q('.note-view, .demo-caption') || title === 'Con sẵn sàng chưa?' || (q('.keyboard-wrap') && q('.countdown'))) return 'notes';
  if (q('.keyboard-wrap') && /^(🎉 )?Đúng rồi!$|^Chưa đúng|^👀 Nhìn lại/.test(title)) return 'quiz';
  if (q('.library-wrap')) return 'library';
  if (q('.hero-title') && txt(q('.hero-title')).startsWith('Học Piano')) return 'start';
  return 'other';
};
const signature = () => {
  const q = (s) => txt(document.querySelector(s)).slice(0, 60);
  return [screenKind(), q('.step-tag'), q('.progress'), q('.stage .title, h1.title, .hero-title'), q('.song-progress'),
    buttons().map(label).join('|')].join(' / ');
};
/** Lái tự động: trả về các thao tác chạm cho màn hiện tại (đường bố mẹ, micro tắt). */
const decide = () => {
  const kind = screenKind();
  const out = { kind, sig: signature(), actions: [], home: kind === 'home' };
  // Màn đáp án của trò nốt/quãng: 'ok' | 'wrong' (để kiểm đáp án đọc từ khuông là đúng)
  { const t = txt(document.querySelector('.stage .title')); out.verdict = /^(🎉 )?Đúng rồi!$/.test(t) ? 'ok' : /^Chưa đúng|^👀 Nhìn lại/.test(t) ? 'wrong' : null; }
  if (out.home) return out;
  const tap = (el, what) => el && out.actions.push(target(el, what));
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)].filter(vis);
  // Hộp xác nhận
  if (kind === 'dialog') { tap([...q('.dialog-backdrop').querySelectorAll('button')].find((b) => label(b) !== 'Hủy'), 'dialog-ok'); return out; }
  // Kết thúc buổi
  if (kind === 'session-end') { out.banner = txt(q('.screen .banner')); out.stickers = txt(q('.sticker-reveal-title')); tap(btn('Để mai học tiếp'), 'Để mai học tiếp'); return out; }
  // Phiếu chấm của bố mẹ: tích hết các ý rồi "Xong"
  const pc = qa('.pcheck-item');
  if (pc.length) {
    const off = pc.find((b) => !b.classList.contains('on'));
    if (off) tap(off, 'pcheck:' + txt(off.querySelector('.pcheck-label')));
    else tap(btn('Xong'), 'Xong (phiếu chấm)');
    return out;
  }
  // Đọc nốt / nốt mốc: đọc nốt trên khuông, chạm đúng phím
  if (kind === 'quiz:read' || kind === 'quiz:landmark') {
    const head = q('.staff-quiz [data-e2e-pitch], .stage [data-e2e-pitch]');
    const p = head?.getAttribute('data-e2e-pitch');
    const k = p && keyFor(p);
    if (k && !q('.quiz-verdict') && (kind === 'quiz:read' ? !txt(q('.stage .lead')).startsWith('Đó là') : true)) { out.answer = p; tap(k, 'key ' + p); return out; }
    if (!k && qa('.lm-choices button').length && !q('.quiz-verdict')) { tap(qa('.lm-choices button')[0], 'landmark-choice'); return out; }
  }
  // Quãng trên khuông: tính quãng từ 2 nốt
  if (kind === 'quiz:interval') {
    const heads = [...document.querySelectorAll('.staff-quiz [data-e2e-pitch]')].map((e) => e.getAttribute('data-e2e-pitch'));
    if (heads.length >= 2) {
      const d = diat(heads[1]) - diat(heads[0]);
      const KL = ['Giống', 'Bước', 'Nhảy', 'Nhảy xa 4', 'Nhảy xa 5'][Math.abs(d)];
      const dir = d > 0 ? 'up' : 'down';
      out.answer = heads.join('→') + ' ' + KL + (d ? ' ' + dir : '');
      const grid = q('.iv-answers.iv-grid'), kinds = q('.iv-answers.iv-kinds'), dirs = q('.iv-answers.iv-dirs');
      let b = null;
      if (grid) b = d === 0 ? btn('Giống') : btn(KL + (dir === 'up' ? ' lên ⬆️' : ' xuống ⬇️'));
      else if (kinds) b = btn(KL);
      else if (dirs) b = btn(dir === 'up' ? 'Lên' : 'Xuống');
      if (b) { tap(b, 'interval ' + label(b)); return out; }
    }
  }
  // Trò nghe có nút lựa chọn: chọn bất kỳ (đáp án tai nghe không quan trọng cho kiểm thử)
  const choice = qa('.choice-row button')[0];
  if (choice && !btn('Tiếp')) { tap(choice, 'choice ' + label(choice)); return out; }
  // Đoán nốt (không có nút): chạm một phím gợi ý
  if (kind === 'quiz' && q('.stage .progress') && /^Nốt nào đây/.test(txt(q('.stage .title'))) && !btn('Tiếp')) {
    const k = qa('.key.is-guide')[0] || qa('.key[data-pitch]')[0];
    if (k) { tap(k, 'key ' + k.dataset.pitch); return out; }
  }
  // Từng nốt: chạm phím đang sáng rồi "👪 Đúng rồi"
  const ok = btn('Đúng rồi');
  if (ok && q('.note-view')) {
    qa('.key.is-target').slice(0, 4).forEach((k) => tap(k, 'key ' + k.dataset.pitch));
    tap(ok, 'Đúng rồi');
    return out;
  }
  // Sáng tác: chạm phím sáng tới khi đủ ô nhịp → Lưu bài
  if (q('.iv-palette')) {
    const save = btn('Lưu bài');
    if (save) tap(save, 'Lưu bài');
    else { const k = qa('.key.is-target')[(out.sig.length) % Math.max(1, qa('.key.is-target').length)] || qa('.key.is-target')[0]; tap(k, 'compose key ' + k?.dataset.pitch); }
    return out;
  }
  // Phím đen tự do: chạm vài phím đen rồi Xong
  if (q('.iv-count')) {
    qa('.key-black').slice(0, 3).forEach((k) => tap(k, 'black ' + k.dataset.pitch));
    tap(btn('Xong'), 'Xong (phím đen)');
    return out;
  }
  // Thứ tự ưu tiên các nút còn lại
  const ORDER = ['Đúng hết!', 'Về nhà rồi!', 'Con làm đúng rồi', 'Bố mẹ: qua', 'Bố mẹ: tiếp', 'Bố mẹ đã học xong', 'Tặng huy chương',
    'Lưu vào Thư viện', 'Con xong rồi', 'Đúng rồi', 'Xong rồi', 'Tiếp', 'Câu tiếp', 'Con làm nào', 'Con đàn', 'Con vỗ',
    'Bắt đầu', 'Dễ — con đàn được'];
  for (const l of ORDER) {
    const b = btn(l);
    if (b) { tap(b, l); return out; }
  }
  return out;
};
`;
const inPage = (body) => `(() => { ${LIB}\n${body}\n })()`;

/** Chạm (chuột giả lập) tại toạ độ — đi đúng đường sự kiện thật (pointerdown/up, click). */
async function tapXY(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(40);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
let blockedTaps = 0;
async function doAction(a) {
  if (a.blocked) {
    // Có lớp khác đè lên (pháo giấy, bàn tay hoạt hình…) → vẫn chạm, nhưng ghi lại để xem
    blockedTaps++;
    log(`    (chạm "${a.what}" bị phần tử khác che: ${a.hit})`);
  }
  await tapXY(a.x, a.y);
}

/** Tìm phần tử bằng JS (trong LIB) rồi chạm. `finder` là biểu thức trả về Element. */
async function tapBy(finder, what, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const a = await evaluate(inPage(`const el = (${finder}); return el && vis(el) && !el.disabled ? target(el, ${JSON.stringify(what)}) : null;`));
    if (a) {
      await doAction(a);
      return a;
    }
    if (Date.now() > end) throw new Fail(`Không thấy "${what}" (${finder})`);
    await sleep(200);
  }
}
const tapText = (text, timeoutMs) => tapBy(`btn(${JSON.stringify(text)})`, text, timeoutMs);
const tapTextStarts = (text, timeoutMs) => tapBy(`btnStarts(${JSON.stringify(text)})`, text, timeoutMs);
const tapSel = (sel, timeoutMs) => tapBy(`document.querySelector(${JSON.stringify(sel)})`, sel, timeoutMs);

async function waitFor(expr, what, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      last = await evaluate(inPage(`return (${expr});`));
      if (last) return last;
    } catch (e) {
      last = e.message; // trang đang tải lại
    }
    if (Date.now() > end) throw new Fail(`Hết giờ chờ: ${what} (${JSON.stringify(last)?.slice(0, 200)})`);
    await sleep(200);
  }
}
const kindNow = () => evaluate(inPage('return screenKind();')).catch(() => 'loading');
const homeTitle = () => evaluate(inPage(`return txt(document.querySelector('.topbar-week'));`));

async function navigate(url) {
  await cdp.send('Page.navigate', { url });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#app > *')`, `tải ${url}`, 20_000);
}
async function reload() {
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(300);
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#app > *')`, 'tải lại trang', 20_000);
}
const appData = () => evaluate(`JSON.parse(localStorage.getItem('piano-be-9') || 'null')`);

/** Từ màn Bắt đầu (nếu đang ở đó) vào màn chính. */
async function toHome() {
  const k = await kindNow();
  if (k === 'home') return;
  if (k === 'start') {
    await tapText('Bắt đầu');
    await waitFor(`screenKind() === 'home' || screenKind() === 'onboarding'`, 'màn chính sau Bắt đầu');
    if ((await kindNow()) === 'onboarding') await tapText('Bỏ qua');
    await waitFor(`screenKind() === 'home'`, 'màn chính');
    return;
  }
  throw new Fail(`toHome: đang ở màn "${k}"`);
}

// ---------------- lái một buổi học ----------------
const STUCK_MS = 120_000;
/**
 * Bấm "Học tiếp" (hoặc một hàng bài) rồi lái tự động tới khi về màn chính.
 * Trả về { kinds: Set, banner, steps, ms }.
 */
async function runSession(label, start, o = {}) {
  const tStart = Date.now();
  if (start === 'next') await tapTextStarts('Học tiếp:');
  else await tapSel(`[data-lesson="${start}"]`);
  log(`  ▶ buổi ${label} (${start})`);
  const kinds = new Set();
  const seq = [];
  let lastSig = '';
  let sigSince = Date.now();
  let banner = '';
  let stickers = '';
  let ticks = 0;
  const answers = [];
  let pendingAnswer = null;
  const verdicts = { ok: 0, wrong: [] };
  for (;;) {
    ticks++;
    let d;
    try {
      d = await evaluate(inPage('return decide();'));
    } catch (e) {
      // trang có thể đang vẽ lại / tải lại
      await sleep(300);
      if (Date.now() - sigSince > STUCK_MS) throw e;
      continue;
    }
    if (d.sig !== lastSig) {
      lastSig = d.sig;
      sigSince = Date.now();
      if (!kinds.has(d.kind)) seq.push(d.kind);
      kinds.add(d.kind);
      if (!o.quietShots) await shot(`${label}-${d.kind}`, true);
    }
    if (d.answer) {
      answers.push(d.answer);
      pendingAnswer = d.answer;
    } else if (pendingAnswer && d.verdict) {
      if (d.verdict === 'ok') verdicts.ok++;
      else verdicts.wrong.push(pendingAnswer);
      pendingAnswer = null;
    }
    if (d.banner) banner = d.banner;
    if (d.stickers) stickers = d.stickers;
    if (d.home) break;
    if (Date.now() - sigSince > STUCK_MS) {
      await shot(`${label}-STUCK`);
      throw new Fail(`Buổi ${label} kẹt ở: ${d.sig}`);
    }
    if (Date.now() - tStart > (o.maxMs ?? 20 * 60_000)) throw new Fail(`Buổi ${label} quá lâu (${d.sig})`);
    for (const a of d.actions) {
      await doAction(a);
      await sleep(60);
    }
    await sleep(d.actions.length ? 250 : 400);
  }
  const ms = Date.now() - tStart;
  log(`  ✓ buổi ${label} xong sau ${(ms / 1000).toFixed(0)}s — các màn: ${seq.join(' → ')}${banner ? ` — banner: ${banner}` : ''}`);
  if (answers.length) log(`    đáp án đã chọn: ${[...new Set(answers)].slice(0, 12).join(', ')}`);
  await shot(`${label}-home`);
  // Buổi vừa xong đã được lưu: trò đọc nốt/nốt mốc/quãng (đáp án đọc từ khuông) phải đúng hết
  const data = await appData();
  const last = data.sessions[data.sessions.length - 1];
  if (verdicts.ok || verdicts.wrong.length) log(`    đọc nốt trên khuông / quãng: đúng ${verdicts.ok}/${verdicts.ok + verdicts.wrong.length}${verdicts.wrong.length ? ' — SAI: ' + verdicts.wrong.join(', ') : ''}`);
  assert(!verdicts.wrong.length, `Buổi ${label}: trả lời theo nốt trên khuông mà app chấm sai: ${verdicts.wrong.join(', ')}`);
  assert(last?.completed, `Buổi ${label} chưa được lưu là hoàn thành`);
  return { kinds, seq, banner, stickers, ms, verdicts };
}

// ---------------- cổng phụ huynh ----------------
async function openParent() {
  await waitFor(`!!document.querySelector('.parent-btn')`, 'nút Phụ huynh');
  const a = await evaluate(inPage(`return target(document.querySelector('.parent-btn'), 'Phụ huynh');`));
  // Nhấn giữ 2 giây (thử nhả sớm trước: 0,5 giây thì KHÔNG được mở)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  await sleep(500);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  await sleep(1800);
  assert((await kindNow()) === 'home', 'Nhấn 0,5 giây đã mở cổng phụ huynh (phải giữ 2 giây)');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  await sleep(2300);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  await waitFor(`screenKind() === 'parent-gate'`, 'cổng phụ huynh sau khi giữ 2 giây');
  // Thử sai một lần → câu hỏi mới, vẫn ở cổng
  const q1 = await evaluate(inPage(`return txt(document.querySelector('.gate-q'));`));
  await tapBy(`[...document.querySelectorAll('.key-btn')].find((b) => txt(b) === '1')`, 'phím 1');
  await tapBy(`document.querySelector('.key-ok')`, 'OK');
  await sleep(300);
  assert((await kindNow()) === 'parent-gate', 'Trả lời sai mà vẫn vào được màn phụ huynh');
  const q = await evaluate(inPage(`return txt(document.querySelector('.gate-q'));`));
  const m = /(\d+)\s*\+\s*(\d+)/.exec(q);
  assert(m, `Không đọc được câu hỏi cổng: "${q}" (trước: "${q1}")`);
  const ans = String(Number(m[1]) + Number(m[2]));
  for (const ch of ans) await tapBy(`[...document.querySelectorAll('.key-btn')].find((b) => txt(b) === ${JSON.stringify(ch)})`, `phím ${ch}`);
  await tapBy(`document.querySelector('.key-ok')`, 'OK');
  await waitFor(`screenKind() === 'parent'`, 'màn Phụ huynh');
}
async function openAdvanced() {
  const open = await evaluate(`!!document.querySelector('details.adv')?.open`);
  if (!open) await tapSel('details.adv > summary');
  await waitFor(`document.querySelector('details.adv')?.open`, 'mở Nâng cao');
}
async function setWeek(week) {
  await openParent();
  await openAdvanced();
  // <select> gốc: chọn bằng bàn phím không ổn định ở headless → đặt giá trị + sự kiện change (như người dùng chọn)
  const ok = await evaluate(
    inPage(`const s = document.querySelector('details.adv select'); if (!s) return false; s.scrollIntoView({block:'center'});
      s.value = '${week}'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`),
  );
  assert(ok, 'Không thấy ô chọn tuần');
  await sleep(300);
  await shot(`parent-week-${week}`);
  await tapText('Về màn của bé');
  await waitFor(`screenKind() === 'home'`, 'về màn chính');
  const t = await homeTitle();
  assert(t.startsWith(`Tuần ${week} `), `Màn chính phải là Tuần ${week}, đang là "${t}"`);
}

// ---------------- kịch bản ----------------
const results = []; // { id, name, pass, ms, notes[], error }

async function scenario(id, name, fn) {
  if (!ONLY.includes(id)) return;
  currentScenario = id;
  const notes = [];
  const before = problems.length;
  const t = Date.now();
  log(`\n=== Kịch bản ${id}: ${name}`);
  let error = null;
  try {
    await fn(notes);
  } catch (e) {
    error = e instanceof Fail ? e.message : `${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`;
    log(`  ✗ ${error}`);
    await shot('FAIL');
  }
  const mine = problems.slice(before).filter((p) => !p.expected);
  if (!error && mine.length) error = `${mine.length} lỗi console/mạng ngoài dự kiến (xem summary.json)`;
  const r = { id, name, pass: !error, ms: Date.now() - t, notes, error, problems: problems.slice(before) };
  results.push(r);
  log(`=== ${id}: ${r.pass ? 'ĐẠT ✓' : 'HỎNG ✗'} (${(r.ms / 1000).toFixed(0)}s)`);
  return r;
}

async function main() {
  if (!SKIP_BUILD) runBuild();
  assert(existsSync(join(ROOT, 'dist', 'sw.js')), 'Chưa có dist/sw.js — bỏ --skip-build');
  // Bản build v1 được chép ra thư mục riêng → kịch bản E có thể phát "bản mới" mà không đụng mã nguồn / dist
  const v1 = join(OUT, 'build-v1');
  cpSync(join(ROOT, 'dist'), v1, { recursive: true });
  appPort = await freePort();
  preview = await startPreview(v1, appPort);
  APP_URL = preview.url;
  await launchEdge();
  log(`Edge CDP :${CDP_PORT} · app ${APP_URL} · ra ${OUT}`);

  await navigate(APP_URL);
  const audioOk = await evaluate(
    `(async () => { const c = new AudioContext(); await c.resume().catch(() => {}); const a = c.currentTime; await new Promise((r) => setTimeout(r, 1000)); const b = c.currentTime; const st = c.state; c.close(); return { state: st, advanced: b - a }; })()`,
  );
  const voices = await evaluate(`(speechSynthesis.getVoices() || []).filter((v) => v.lang.toLowerCase().startsWith('vi')).map((v) => v.name).join(', ')`);
  log(`  AudioContext headless: ${audioOk.state}, chạy ${audioOk.advanced.toFixed(2)}s / 1s thật · giọng vi: ${voices || '(không có)'}`);

  // ---------- A ----------
  await scenario('A', 'Lần đầu dùng → Hướng dẫn → buổi đầu → hết tuần 1 → lên tuần 2', async (notes) => {
    await waitFor(`screenKind() === 'start'`, 'màn Bắt đầu');
    await shot('start');
    await tapText('Bắt đầu');
    await waitFor(`screenKind() === 'onboarding'`, 'Hướng dẫn nhanh (lần đầu)');
    let cards = 0;
    for (let i = 0; i < 8; i++) {
      const step = await evaluate(inPage(`return txt(document.querySelector('.onb-step'));`));
      cards++;
      await shot(`onboarding-${step.replace('/', 'of')}`);
      const last = await evaluate(inPage(`return !!btn('Bắt đầu học');`));
      if (last) {
        assert(step === '4/4', `Thẻ cuối phải là 4/4, đang là ${step}`);
        await tapText('Bắt đầu học');
        break;
      }
      await tapText('Tiếp');
      await waitFor(`txt(document.querySelector('.onb-step')) !== ${JSON.stringify(step)}`, 'sang thẻ kế');
    }
    assert(cards === 4, `Hướng dẫn có ${cards} thẻ (mong đợi 4)`);
    await waitFor(`screenKind() === 'home'`, 'màn chính sau Hướng dẫn');
    const d0 = await appData();
    assert(d0?.settings?.onboardedAt, 'Chưa ghi settings.onboardedAt sau Hướng dẫn');
    let title = await homeTitle();
    assert(title.startsWith('Tuần 1 '), `Màn chính phải là Tuần 1: "${title}"`);
    await shot('home-first');
    notes.push(`Hướng dẫn: ${cards} thẻ; màn chính "${title}"`);

    const s1 = await runSession('w1-1', 'next');
    const prog = await evaluate(
      inPage(`return { done: document.querySelectorAll('.lesson-row.is-done').length, stars: txt(document.querySelector('.today-stars')),
        dots: document.querySelectorAll('.goal-dots .dot.on').length, next: label(btnStarts('Học tiếp:') || document.body) };`),
    );
    notes.push(`Sau buổi 1: ${prog.done} bài ✓, sao hôm nay "${prog.stars}", chấm tuần ${prog.dots}, Học tiếp → "${prog.next}"`);
    assert(prog.done >= 1, 'Màn chính chưa đánh dấu bài 1 đã học');
    assert(prog.stars, 'Màn chính chưa hiện sao hôm nay');
    assert(prog.dots >= 1, 'Mục tiêu tuần chưa có chấm nào');
    const d1 = await appData();
    assert(d1.progress.lessonsCompleted.includes('w1-l1'), 'lessonsCompleted thiếu w1-l1');
    notes.push(`Buổi 1 các màn: ${s1.seq.join(' → ')}`);

    // Học hết tuần 1 bằng "Học tiếp"
    let n = 1;
    let advanced = '';
    while (n < 10) {
      title = await homeTitle();
      if (!title.startsWith('Tuần 1 ')) break;
      n++;
      const s = await runSession(`w1-${n}`, 'next', { quietShots: false });
      if (s.banner) advanced = s.banner;
    }
    title = await homeTitle();
    const d2 = await appData();
    const test = d2.sessions.find((s) => s.lessonId === 'w1-test' && s.completed);
    const c4 = test ? test.parentAssessments.filter((a) => a.note === 'C4' && a.result === 'correct').length : 0;
    notes.push(`Tuần 1 xong sau ${n} buổi; thử thách C4 đúng ${c4} lần; banner: "${advanced}"; màn chính: "${title}"`);
    assert(test, 'Không có buổi thử thách w1-test');
    assert(c4 >= 10, `Thử thách C4 chỉ đúng ${c4}/10`);
    assert(title.startsWith('Tuần 2 '), `Sau tuần 1 phải lên Tuần 2, đang "${title}"`);
    assert(d2.progress.currentWeek === 2, `progress.currentWeek = ${d2.progress.currentWeek}`);
    assert(/qua|Chặng/.test(advanced), `Màn tổng kết không báo qua đảo (banner "${advanced}")`);
  });

  // ---------- B ----------
  const allKinds = new Set();
  await scenario('B', 'Phụ huynh đổi tuần 12/18/22/28 → mỗi tuần một buổi (+ các kiểu bước còn lại)', async (notes) => {
    await navigate(APP_URL);
    await toHome();
    for (const w of B_WEEKS) {
      await setWeek(w);
      const s = await runSession(`w${w}`, 'next');
      s.kinds.forEach((k) => allKinds.add(k));
      notes.push(`Tuần ${w}: ${s.seq.join(' → ')} (${(s.ms / 1000).toFixed(0)}s)`);
    }
    if (!QUICK) {
      // Kiểu bước chưa gặp trong "Học tiếp" → chạy đúng bài có kiểu đó
      const extra = [
        { w: 3, lesson: 'w3-l4', want: 'improv:black-keys' },
        { w: 6, lesson: 'w6-l1', want: 'dynamics' },
        { w: 11, lesson: 'w11-l1', want: 'quiz:landmark' },
        { w: 11, lesson: 'w11-l3', want: 'improv:question-answer' },
        { w: 12, lesson: 'w12-stac', want: 'dynamics' },
        { w: 22, lesson: 'w22-l3', want: 'sight' },
        { w: 22, lesson: 'w22-l4', want: 'improv:compose' },
        { w: 13, lesson: 'w13-l4', want: 'quiz:interval' },
      ];
      let curW = B_WEEKS[B_WEEKS.length - 1] ?? 0;
      for (const x of extra) {
        if (allKinds.has(x.want) && !['w12-stac', 'w6-l1'].includes(x.lesson)) {
          notes.push(`(bỏ ${x.lesson}: đã gặp ${x.want})`);
          continue;
        }
        if (curW !== x.w) {
          await setWeek(x.w);
          curW = x.w;
        }
        const s = await runSession(x.lesson, x.lesson);
        s.kinds.forEach((k) => allKinds.add(k));
        notes.push(`${x.lesson}: ${s.seq.join(' → ')} (${(s.ms / 1000).toFixed(0)}s)`);
        assert(s.kinds.has(x.want), `Bài ${x.lesson} không hiện màn ${x.want}`);
      }
      const d = await appData();
      notes.push(`Bài sáng tác đã lưu: ${(d.compositions ?? []).length}`);
    }
    const kinds = [...allKinds].filter((k) => !['home', 'other'].includes(k)).sort();
    notes.push(`Các loại màn đã chạy hết: ${kinds.join(', ')}`);
    const want = ['posture', 'notes', 'technique', 'song', 'review-song', 'teach', 'rating', 'session-end', 'quiz:read'];
    if (B_WEEKS.includes(18)) want.push('rhythm'); // nhịp: bài đầu tuần 18
    if (!QUICK) want.push('quiz:interval', 'improv:black-keys', 'improv:question-answer', 'improv:compose', 'quiz:landmark', 'dynamics', 'sight');
    const missing = want.filter((k) => !allKinds.has(k));
    assert(!missing.length, `Chưa gặp các màn: ${missing.join(', ')}`);
  });

  // ---------- C ----------
  await scenario('C', 'Thư viện / Xem mẫu / Sổ sticker / Phụ huynh (Nâng cao, Sao lưu)', async (notes) => {
    await navigate(APP_URL);
    await toHome();
    await tapText('Bài hát');
    await waitFor(`screenKind() === 'library'`, 'Thư viện');
    await shot('library');
    let nCards = await evaluate(`document.querySelectorAll('.song-card:not(.locked)').length`);
    if (!nCards) {
      // Tuần 1 chưa có bài hát nào mở (đúng thiết kế) → chạm bài khóa phải có thông báo, rồi lên tuần 2
      await tapSel('.song-card.locked');
      const t = await waitFor(`document.querySelector('.toast.show') && txt(document.querySelector('.toast'))`, 'thông báo bài khóa');
      notes.push(`Tuần 1: mọi bài khóa; chạm bài khóa → "${t}"`);
      await tapText('Quay lại');
      await waitFor(`screenKind() === 'home'`, 'về màn chính');
      await setWeek(2);
      await tapText('Bài hát');
      await waitFor(`screenKind() === 'library'`, 'Thư viện');
      nCards = await evaluate(`document.querySelectorAll('.song-card:not(.locked)').length`);
    }
    notes.push(`Thư viện: ${nCards} bài mở`);
    assert(nCards > 0, 'Thư viện không có bài nào mở');
    await tapSel('.song-card:not(.locked)');
    await waitFor(`screenKind() === 'song'`, 'màn bài hát');
    const songTitle = await evaluate(inPage(`return txt(document.querySelector('.song-title'));`));
    await shot('song');
    await tapText('Xem mẫu');
    await waitFor(`!!btn('Dừng')`, 'đang xem mẫu (nút Dừng)');
    await sleep(2500);
    await shot('song-demo');
    // Xem mẫu tự kết thúc (đồng hồ âm thanh chạy) hoặc bấm Dừng
    const ended = await waitFor(`!!btn('Xem mẫu')`, 'xem mẫu tự kết thúc', 60_000).catch(() => false);
    if (!ended) await tapText('Dừng');
    notes.push(`Bài "${songTitle}": Xem mẫu ${ended ? 'tự chạy hết' : 'dừng tay'}`);
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'library'`, 'về Thư viện');
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'home'`, 'về màn chính');

    await tapText('Sticker');
    await waitFor(`screenKind() === 'stickers'`, 'Sổ sticker');
    const st = await evaluate(inPage(`return txt(document.querySelector('.sticker-total'));`));
    await shot('stickers');
    notes.push(`Sổ sticker: ${st}`);
    await tapText('Quay lại').catch(async () => tapTextStarts('←'));
    await waitFor(`screenKind() === 'home'`, 'về màn chính từ sticker');

    await openParent();
    await shot('parent');
    await openAdvanced();
    await shot('parent-advanced');
    const ver = await evaluate(inPage(`return txt(document.querySelector('.version-card b'));`));
    notes.push(`Phiên bản: ${ver}`);
    const hasShare = await evaluate(`typeof navigator.share === 'function' && typeof navigator.canShare === 'function'`);
    await tapText('Sao lưu dữ liệu');
    // Lời nhắn BACKUP_MESSAGE (✅ … / ❌ …) hiện thành banner trên màn Phụ huynh
    const msg = await waitFor(
      `[...document.querySelectorAll('.banner')].map(txt).find((t) => /^[✅❌]/.test(t)) || ''`,
      'thông báo sao lưu',
      15_000,
    );
    await shot('parent-backup');
    notes.push(`Sao lưu (navigator.share ${hasShare ? 'có' : 'không có'}): "${msg}"`);
    assert(!msg.startsWith('❌'), `Sao lưu báo lỗi: ${msg}`);
    let dl = [];
    for (let i = 0; i < 25; i++) {
      dl = existsSync(join(OUT, 'downloads')) ? readdirSync(join(OUT, 'downloads')).filter((f) => f.endsWith('.json')) : [];
      if (dl.length || !msg.includes('tải file')) break;
      await sleep(200);
    }
    if (msg.includes('tải file')) assert(dl.length, 'Báo đã tải file sao lưu nhưng không thấy file');
    if (dl.length) {
      const j = JSON.parse(readFileSync(join(OUT, 'downloads', dl[0]), 'utf8'));
      notes.push(`File tải về: ${dl[0]} (tuần ${j?.progress?.currentWeek ?? j?.data?.progress?.currentWeek ?? '?'})`);
    }
    assert((await kindNow()) === 'parent', 'Sao lưu làm rời màn Phụ huynh');
    // Hướng dẫn mở lại từ màn Phụ huynh
    await tapText('Hướng dẫn');
    await waitFor(`screenKind() === 'onboarding'`, 'Hướng dẫn từ màn Phụ huynh');
    await tapText('Bỏ qua');
    await waitFor(`screenKind() === 'parent'`, 'về Phụ huynh');
    await tapText('Về màn của bé');
    await waitFor(`screenKind() === 'home'`, 'về màn chính');
  });

  // ---------- D ----------
  let dataBeforeOffline = null;
  await scenario('D', 'PWA offline: service worker phục vụ app khi mất mạng + tắt máy chủ', async (notes) => {
    await navigate(APP_URL);
    const sw = await waitFor(
      `navigator.serviceWorker.getRegistration().then((r) => r && r.active && navigator.serviceWorker.controller ? { state: r.active.state, url: r.active.scriptURL, scope: r.scope } : null)`,
      'service worker active + điều khiển trang',
      30_000,
    );
    notes.push(`SW ${sw.state} ${sw.url} scope ${sw.scope}`);
    const caches0 = await evaluate(`caches.keys().then((k) => k.join(','))`);
    notes.push(`Cache: ${caches0}`);
    await toHome();
    dataBeforeOffline = await appData();
    const titleBefore = await homeTitle();
    expectNetFailures = true;
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await preview.stop(); // mất mạng thật: máy chủ cũng tắt
    log('  (offline + đã tắt máy chủ)');
    const online = await evaluate('navigator.onLine');
    await reload();
    await waitFor(`screenKind() === 'start'`, 'màn Bắt đầu khi offline', 20_000);
    await shot('offline-start');
    await toHome();
    const titleAfter = await homeTitle();
    await shot('offline-home');
    const dataAfter = await appData();
    notes.push(`navigator.onLine=${online}; màn chính offline: "${titleAfter}" (trước: "${titleBefore}"); ${dataAfter.sessions.length} buổi`);
    assert(titleAfter === titleBefore, 'Dữ liệu/tuần khác sau khi tải lại offline');
    assert(dataAfter.sessions.length === dataBeforeOffline.sessions.length, 'Số buổi học thay đổi sau tải lại offline');
    // Mở thử một màn có tài nguyên (font/tranh) khi offline
    await tapText('Bài hát');
    await waitFor(`screenKind() === 'library'`, 'Thư viện offline');
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'home'`, 'về màn chính');
  });

  // ---------- E ----------
  await scenario('E', 'Cập nhật an toàn: không tải lại giữa buổi, cập nhật ở màn chính', async (notes) => {
    // Bản "mới": chép build v1, đổi sw.js (VERSION) + đánh dấu index.html — không đụng mã nguồn
    const v2 = join(OUT, 'build-v2');
    rmSync(v2, { recursive: true, force: true });
    cpSync(v1, v2, { recursive: true });
    const swPath = join(v2, 'sw.js');
    const sw = readFileSync(swPath, 'utf8');
    const m = /const VERSION = '([^']+)'/.exec(sw);
    assert(m, 'Không tìm thấy VERSION trong sw.js');
    writeFileSync(swPath, sw.replace(m[0], `const VERSION = '${m[1]}-e2e2'`));
    const idx = join(v2, 'index.html');
    writeFileSync(idx, readFileSync(idx, 'utf8').replace('<head>', '<head>\n    <meta name="e2e-build" content="v2">'));

    if (preview.proc.exitCode === null) await preview.stop();
    // vẫn đang offline (từ D) — nếu chạy riêng E thì bắt đầu từ trang đã có SW
    if (!ONLY.includes('D')) {
      preview = await startPreview(v1, appPort);
      await navigate(APP_URL);
      await waitFor(`navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active && navigator.serviceWorker.controller))`, 'SW v1', 30_000);
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }
    await toHome().catch(() => undefined);
    await waitFor(`screenKind() === 'home'`, 'màn chính');
    // Vào giữa buổi học (màn Tư thế / ôn nhanh — KHÔNG phải điểm an toàn)
    await tapTextStarts('Học tiếp:');
    await waitFor(`!['home', 'start'].includes(screenKind())`, 'đã vào buổi học');
    await evaluate(`window.__e2eMarker = 'v1-page'; true`);
    const kindIn = await kindNow();
    await shot('in-session-before-update');

    // Phát bản mới, bật mạng lại → app tự hỏi bản mới (sự kiện 'online' → checkForUpdate(true))
    preview = await startPreview(v2, appPort);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    expectNetFailures = false;
    log('  (online, máy chủ phát bản v2)');
    let waiting = await waitFor(
      `navigator.serviceWorker.getRegistration().then((r) => r && r.waiting ? r.waiting.scriptURL : null)`,
      'bản mới đang chờ (registration.waiting) sau sự kiện online',
      20_000,
    ).catch(() => null);
    let trigger = "sự kiện 'online'";
    if (!waiting) {
      // Dự phòng: trình duyệt không bắn 'online' khi tắt giả lập offline → nhờ CDP kiểm tra cập nhật SW
      trigger = 'ServiceWorker.updateRegistration (CDP)';
      await cdp.send('ServiceWorker.enable');
      const scope = await evaluate(`navigator.serviceWorker.getRegistration().then((r) => r.scope)`);
      await cdp.send('ServiceWorker.updateRegistration', { scopeURL: scope });
      waiting = await waitFor(
        `navigator.serviceWorker.getRegistration().then((r) => r && r.waiting ? r.waiting.scriptURL : null)`,
        'bản mới đang chờ (registration.waiting)',
        30_000,
      );
    }
    notes.push(`Bản mới phát hiện qua ${trigger}; đang chờ: ${waiting}`);
    // Ở lại giữa buổi thêm một lúc: KHÔNG được tải lại / đổi controller
    await sleep(4000);
    const mid = await evaluate(
      `({ marker: window.__e2eMarker, meta: !!document.querySelector('meta[name="e2e-build"]'), kind: (() => { ${LIB}; return screenKind(); })(),
         waiting: null })`,
    );
    await shot('in-session-update-waiting');
    notes.push(`Giữa buổi (${kindIn} → ${mid.kind}): trang ${mid.marker === 'v1-page' ? 'KHÔNG tải lại ✓' : 'ĐÃ TẢI LẠI ✗'}`);
    assert(mid.marker === 'v1-page' && !mid.meta, 'App tải lại / đổi bản giữa buổi học');
    assert(!['home', 'start'].includes(mid.kind), `Buổi học bị thoát ra màn ${mid.kind}`);
    // Bé làm tiếp một bước của buổi (vẫn bản cũ, không tải lại)
    const step = await evaluate(inPage('return decide();'));
    for (const a of step.actions) await doAction(a);
    await sleep(1500);
    assert((await evaluate('window.__e2eMarker')) === 'v1-page', 'Tải lại ngay sau thao tác giữa buổi');

    // Về màn chính (Quay lại tới đầu buổi → màn chính = điểm an toàn) → phải tự cập nhật + tải lại
    for (let i = 0; i < 12; i++) {
      const k = await kindNow();
      if (k === 'home' || k === 'loading') break;
      const back = await evaluate(inPage(`const b = btn('Quay lại'); return b ? target(b, 'Quay lại') : null;`)).catch(() => null);
      if (!back) break;
      await doAction(back);
      await sleep(600);
    }
    const reloaded = await waitFor(
      `!window.__e2eMarker && !!document.querySelector('meta[name="e2e-build"]') && document.readyState === 'complete'`,
      'tự tải lại sang bản mới ở điểm an toàn',
      30_000,
    );
    await waitFor(`screenKind() === 'start' || screenKind() === 'home'`, 'app mở lại sau cập nhật');
    await shot('after-update');
    const ctrl = await evaluate(`navigator.serviceWorker.controller?.scriptURL ?? null`);
    const cacheKeys = await evaluate(`caches.keys().then((k) => k.join(','))`);
    notes.push(`Sau khi về điểm an toàn: đã tải lại sang v2 (${reloaded ? 'meta e2e-build có' : '?'}); cache: ${cacheKeys}`);
    assert(/-e2e2/.test(cacheKeys), 'Cache của bản mới chưa được dùng');
    assert(!cacheKeys.split(',').some((k) => k && !k.endsWith('-e2e2')), 'Cache bản cũ chưa được dọn');
    await toHome();
    const dataAfter = await appData();
    const title = await homeTitle();
    notes.push(`Dữ liệu sau cập nhật: "${title}", ${dataAfter.sessions.length} buổi; controller ${ctrl}`);
    if (dataBeforeOffline) assert(dataAfter.progress.currentWeek === dataBeforeOffline.progress.currentWeek, 'Mất tuần hiện tại sau cập nhật');
    await shot('after-update-home');
  });
}

// ---------------- chạy ----------------
let fatal = null;
try {
  await main();
} catch (e) {
  fatal = e;
  log(`LỖI NGHIÊM TRỌNG: ${e.stack ?? e.message}`);
}
try {
  cdp?.ws.close();
} catch {
  /* bỏ qua */
}
edge?.kill();
await preview?.stop().catch(() => undefined);
await sleep(500);
if (!KEEP_PROFILE) {
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* Edge còn giữ file */
  }
}

const summary = {
  when: new Date().toISOString(),
  out: OUT,
  scenarios: results.map(({ problems: p, ...r }) => ({ ...r, problemCount: p.filter((x) => !x.expected).length })),
  problems,
  consoleWarnings,
  blockedTaps,
  fatal: fatal ? String(fatal.stack ?? fatal) : null,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, 'e2e.log'), logLines.join('\n'));
console.log('\n================ KẾT QUẢ E2E ================');
for (const r of results) {
  console.log(`${r.pass ? '✓ ĐẠT ' : '✗ HỎNG'}  ${r.id}  ${r.name}  (${(r.ms / 1000).toFixed(0)}s)`);
  for (const n of r.notes) console.log(`        · ${n}`);
  if (r.error) console.log(`        ✗ ${r.error}`);
}
const unexpected = problems.filter((p) => !p.expected);
console.log(`Lỗi console/mạng ngoài dự kiến: ${unexpected.length} · cảnh báo console: ${consoleWarnings.length} · chạm bị che: ${blockedTaps}`);
for (const p of unexpected.slice(0, 20)) console.log(`   [${p.scenario}] ${p.kind}: ${p.text.split('\n')[0]}`);
console.log(`Ảnh + log + summary.json: ${OUT}`);
const failed = !!fatal || results.some((r) => !r.pass) || results.length === 0;
process.exit(failed ? 1 : 0);
