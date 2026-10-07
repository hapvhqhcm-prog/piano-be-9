/**
 * KIỂM THỬ KHÓI (smoke) trên WEBKIT THẬT — cùng nhân với Safari trên iPad — qua Playwright.
 *
 *   npm run webkit                                  # build + chạy hết
 *   node scripts/webkit-smoke.mjs --skip-build      # dùng dist/ có sẵn
 *   node scripts/webkit-smoke.mjs --engine chromium # chạy y hệt trên Edge đã cài (kênh msedge) để so ảnh với WebKit
 *   (khác: --weeks 12,19,29 · --mouse = chạm bằng chuột · --no-fake-audio)
 *   node scripts/webkit-smoke.mjs --only A,C --headed --out D:\tmp\wk
 *
 * Cần: `npm i -D playwright` + `npx playwright install webkit` (một lần).
 *
 * Cách chạy: `vite build` vào <ra>/build (hoặc --skip-build: chép dist/ có sẵn) → `vite preview` (base /piano-be-9/) ở cổng trống →
 * WebKit chạy ngầm với ngữ cảnh giống iPad (1080×810, deviceScaleFactor 2, isMobile, hasTouch, UA Safari iPad) →
 * lái UI THẬT theo chữ trên nút (micro tắt → đường "👪 bố mẹ"), chạm bằng touchscreen.tap (sự kiện chạm thật).
 * Thư viện "lái tự động" trong trang (screenKind/decide/…) lấy NGUYÊN VĂN từ scripts/e2e.mjs để hai bộ kiểm luôn khớp.
 *
 * Kịch bản:
 *   P  Dò tính năng WebKit: AudioContext có chạy không, speechSynthesis/giọng vi, share/canShare/clipboard, font tiếng Việt, CSS.
 *   A  Bắt đầu → Hướng dẫn → màn chính → Học tiếp (một buổi trọn vẹn tuần 1) → tổng kết → màn chính.
 *   C  Thư viện (lọc 🇻🇳) → bài hát → Xem mẫu; Sổ sticker; cổng phụ huynh (giữ 2 giây + phép tính) → Nâng cao,
 *      💾 Sao lưu, 📊 Báo cáo, 🎤 Cài micro (3 bước); Soạn bài (gõ chữ → khuông); Đàn tự do → 🎵 Đàn theo thầy.
 *   B  Phụ huynh đổi tuần 12 / 19 / 29 (hộp xác nhận) → mỗi tuần một buổi "Học tiếp".
 *   D  Service worker: đăng ký + điều khiển trang → offline → tải lại (nếu WebKit hỗ trợ).
 *
 * Kết quả: ảnh PNG từng bước, webkit.log, summary.json trong <scratchpad>/webkit-N (hoặc --out).
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let pw;
try {
  pw = await import('playwright');
} catch {
  console.error('Chưa cài Playwright: npm i -D playwright && npx playwright install webkit');
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const BASE = '/piano-be-9/';
const W = 1080;
const H = 810;
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// ---------------- tham số ----------------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ENGINE = opt('--engine') ?? 'webkit'; // webkit | chromium (= Edge đã cài, kênh msedge) | chromium-bundled
const ONLY = (opt('--only') ?? 'P,A,C,B,D').toUpperCase().split(',').map((s) => s.trim());
const SKIP_BUILD = flag('--skip-build');
const HEADED = flag('--headed');
const WEEKS = (opt('--weeks') ?? '12,19,29').split(',').map(Number).filter((n) => n >= 1);
const USE_MOUSE = flag('--mouse'); // chạm bằng chuột thay vì touchscreen.tap
const NO_FAKE_AUDIO = flag('--no-fake-audio'); // không cài AudioContext giả (xem FAKE_AUDIO)

function nextOutDir() {
  const scratch = 'C:\\Users\\Admin\\AppData\\Local\\Temp\\claude\\C--Users-Admin-Desktop\\f9a5e6cb-5b62-4383-9275-dbaf4ea4aaf4\\scratchpad';
  const root = process.env.WEBKIT_OUT_ROOT ?? (existsSync(scratch) ? scratch : join(tmpdir(), 'piano-webkit'));
  mkdirSync(root, { recursive: true });
  const prefix = ENGINE === 'webkit' ? 'webkit' : `webkit-${ENGINE}`;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const used = new Set(readdirSync(root).map((x) => re.exec(x)?.[1]).filter(Boolean).map(Number));
  let n = 1;
  while (used.has(n)) n++;
  return join(root, `${prefix}-${n}`);
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

/** vite build thẳng vào thư mục ra (không đụng dist/ của người khác; bỏ tsc — kiểu đã có `npm run build` lo). */
function runBuild(outDir) {
  log(`▶ vite build → ${outDir}`);
  const r = spawnSync(process.execPath, [VITE, 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: ROOT, encoding: 'utf8' });
  writeFileSync(join(OUT, 'build.log'), `${r.stdout}\n${r.stderr}`);
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error('Build hỏng — xem build.log');
  }
  log('  build xong');
}

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
      if ((await fetch(url)).ok) break;
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
        // Windows: tắt cả cây tiến trình (npx → vite), không để tiến trình con sót lại
        if (process.platform === 'win32' && proc.pid) spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        else proc.kill();
        for (let i = 0; i < 40 && proc.exitCode === null; i++) await sleep(50);
      }
    },
  };
}


/**
 * WebKit của Playwright trên WINDOWS (bản WinCairo) KHÔNG có Web Audio (window.AudioContext = undefined), không có
 * speechSynthesis / getUserMedia / navigator.share — khác Safari iPad thật. Để vẫn lái được UI, khi trình duyệt
 * thiếu AudioContext ta cài một AudioContext GIẢ (im lặng): đồng hồ currentTime chạy theo performance.now(), các node
 * nhận mọi thuộc tính/hàm, nguồn âm bắn onended đúng giờ stop(). Chỉ dùng cho kiểm thử — ghi rõ trong báo cáo.
 * Tắt bằng --no-fake-audio.
 */
const FAKE_AUDIO = `(() => {
  if (window.AudioContext || window.webkitAudioContext) return;
  window.__fakeAudio = true;
  const param = (v = 0) => ({ value: v, defaultValue: v, minValue: -3.4e38, maxValue: 3.4e38, automationRate: 'a-rate',
    setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; }, setValueCurveAtTime() { return this; }, cancelScheduledValues() { return this; }, cancelAndHoldAtTime() { return this; } });
  const PARAMS = new Set(['gain', 'frequency', 'detune', 'Q', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release', 'pan', 'delayTime', 'offset']);
  function node(ctx, extra = {}) {
    const base = Object.assign({ context: ctx, numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2,
      connect: (n) => n, disconnect() {}, addEventListener(t, f) { if (t === 'ended') this.__ended.push(f); }, removeEventListener() {}, __ended: [] }, extra);
    return new Proxy(base, { get(t, k) {
      if (k in t || typeof k === 'symbol') return t[k];
      if (PARAMS.has(k)) return (t[k] = param(k === 'gain' || k === 'playbackRate' ? 1 : 0));
      return undefined;
    } });
  }
  function source(ctx, extra) {
    let ended = false; let timer = 0; let startAt = 0;
    const n = node(ctx, Object.assign({ onended: null, loop: false, buffer: null, type: 'sine',
      setPeriodicWave() {},
      start(t = 0) { startAt = Math.max(t, ctx.currentTime); const b = n.buffer; if (b && !n.loop) n.stop(startAt + b.duration); },
      stop(t = 0) { clearTimeout(timer); const ms = Math.max(0, (Math.max(t, startAt) - ctx.currentTime) * 1000);
        timer = setTimeout(() => { if (ended) return; ended = true; const ev = new Event('ended'); n.onended && n.onended(ev); n.__ended.forEach((f) => f(ev)); }, ms); } }, extra));
    return n;
  }
  class FakeAudioContext extends EventTarget {
    constructor() { super(); this.sampleRate = 48000; this.baseLatency = 0.01; this.outputLatency = 0.02; this._t0 = performance.now(); this._state = 'suspended';
      this.onstatechange = null; this.destination = node(this, { maxChannelCount: 2 }); this.listener = {}; this.audioWorklet = undefined; }
    get state() { return this._state; }
    get currentTime() { return this._state === 'closed' ? 0 : (performance.now() - this._t0) / 1000; }
    _set(s) { if (this._state === s) return; this._state = s; const ev = new Event('statechange'); this.onstatechange && this.onstatechange(ev); this.dispatchEvent(ev); }
    resume() { this._set('running'); return Promise.resolve(); }
    suspend() { this._set('suspended'); return Promise.resolve(); }
    close() { this._set('closed'); return Promise.resolve(); }
    getOutputTimestamp() { return { contextTime: this.currentTime, performanceTime: performance.now() }; }
    createGain() { return node(this); }
    createDynamicsCompressor() { return node(this, { reduction: 0 }); }
    createBiquadFilter() { return node(this, { type: 'lowpass', getFrequencyResponse() {} }); }
    createConvolver() { return node(this, { buffer: null, normalize: true }); }
    createStereoPanner() { return node(this); }
    createDelay() { return node(this); }
    createWaveShaper() { return node(this, { curve: null, oversample: 'none' }); }
    createAnalyser() { return node(this, { fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0.8, minDecibels: -100, maxDecibels: -30,
      getFloatTimeDomainData(a) { a.fill(0); }, getByteTimeDomainData(a) { a.fill(128); }, getFloatFrequencyData(a) { a.fill(-120); }, getByteFrequencyData(a) { a.fill(0); } }); }
    createMediaStreamSource() { return node(this); }
    createOscillator() { return source(this); }
    createBufferSource() { return source(this); }
    createConstantSource() { return source(this); }
    createPeriodicWave() { return {}; }
    createBuffer(ch, len, sr) { const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => data[i], copyToChannel(src, i) { data[i].set(src); }, copyFromChannel(d, i) { d.set(data[i].subarray(0, d.length)); } }; }
    decodeAudioData(ab, ok) { const b = this.createBuffer(1, 4800, 48000); ok && ok(b); return Promise.resolve(b); }
  }
  window.AudioContext = FakeAudioContext;
})();`;

// ---------------- thư viện trong trang: lấy nguyên văn từ e2e.mjs ----------------
const e2eSrc = readFileSync(join(ROOT, 'scripts', 'e2e.mjs'), 'utf8');
const libMatch = /const LIB = String\.raw`([\s\S]*?)\n`;\n/.exec(e2eSrc);
if (!libMatch) throw new Error('Không tìm thấy LIB trong scripts/e2e.mjs');
const LIB = libMatch[1];
const inPage = (body) => `(() => { ${LIB}\n${body}\n })()`;

// ---------------- ghi nhận lỗi ----------------
let currentScenario = 'setup';
let expectNetFailures = false;
const problems = [];
const warnings = [];
const findings = []; // khác biệt / quan sát riêng của WebKit
function addProblem(kind, text, extra = {}) {
  const p = { scenario: currentScenario, kind, text: String(text).slice(0, 600), ...extra };
  problems.push(p);
  log(`  ⚠ [${kind}] ${p.text.split('\n')[0]}${p.expected ? ' (dự kiến)' : ''}`);
}
function finding(text) {
  findings.push({ scenario: currentScenario, text });
  log(`  ◆ ${text}`);
}

let browser;
let context;
let page;
let preview;
let APP_URL = '';

async function launch() {
  const type = ENGINE === 'webkit' ? pw.webkit : pw.chromium;
  const launchOpts = { headless: !HEADED };
  if (ENGINE === 'chromium' || ENGINE === 'msedge') launchOpts.channel = 'msedge'; // giống e2e.mjs, khỏi tải Chromium riêng
  if (ENGINE !== 'webkit') launchOpts.args = ['--autoplay-policy=no-user-gesture-required', '--disable-audio-output'];
  browser = await type.launch(launchOpts);
  context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPAD_UA,
    locale: 'vi-VN',
    serviceWorkers: 'allow',
    acceptDownloads: true,
  });
  if (!NO_FAKE_AUDIO) await context.addInitScript(FAKE_AUDIO);
  page = await context.newPage();
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' || m.type() === 'assert') {
      const expected = expectNetFailures && /Failed to load|network|offline|Could not connect/i.test(text);
      addProblem('console.error', text, { expected });
    } else if (m.type() === 'warning') {
      warnings.push({ scenario: currentScenario, text });
      log(`  · console.warn: ${text.slice(0, 200)}`);
    }
  });
  page.on('pageerror', (e) => addProblem('pageerror', `${e.name}: ${e.message}\n${e.stack ?? ''}`));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '?';
    if (/cancel|abort/i.test(why)) return;
    addProblem('net.failed', `${why} ${r.url()}`, { expected: expectNetFailures });
  });
  page.on('response', (r) => {
    if (r.status() >= 400) addProblem('net.status', `${r.status()} ${r.url()}`, { expected: expectNetFailures });
  });
  page.on('download', async (d) => {
    const f = join(OUT, 'downloads', d.suggestedFilename());
    mkdirSync(join(OUT, 'downloads'), { recursive: true });
    await d.saveAs(f).catch(() => undefined);
    log(`  ⬇ tải về: ${d.suggestedFilename()}`);
  });
  page.on('dialog', (d) => {
    log(`  (hộp thoại trình duyệt ${d.type()}: ${d.message().slice(0, 100)})`);
    void d.dismiss().catch(() => undefined);
  });
}

const evaluate = (expr) => page.evaluate(expr);
let shotNo = 0;
async function shot(name) {
  shotNo++;
  const safe = `${String(shotNo).padStart(3, '0')}-${currentScenario}-${name}`.replace(/[^\w.\-]+/g, '_').slice(0, 90);
  // chờ hiệu ứng vào màn (fade/slide) xong — tối đa 1,5 giây; bỏ qua hoạt ảnh lặp vô hạn
  await page
    .evaluate(() =>
      Promise.race([
        Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
        new Promise((r) => setTimeout(r, 1500)),
      ]),
    )
    .catch(() => undefined);
  try {
    await page.screenshot({ path: join(OUT, `${safe}.png`), timeout: 20_000, animations: 'allow' });
  } catch (e) {
    log(`  (không chụp được ${name}: ${e.message.split('\n')[0]})`);
  }
}

async function tapXY(x, y) {
  if (USE_MOUSE) await page.mouse.click(x, y);
  else await page.touchscreen.tap(x, y);
}
let blockedTaps = 0;
async function doAction(a) {
  if (a.blocked) {
    blockedTaps++;
    log(`    (chạm "${a.what}" bị phần tử khác che: ${a.hit} @${Math.round(a.x)},${Math.round(a.y)})`);
  }
  await tapXY(a.x, a.y);
}
async function tapBy(finder, what, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const a = await evaluate(inPage(`const el = (${finder}); return el && vis(el) && !el.disabled ? target(el, ${JSON.stringify(what)}) : null;`)).catch(
      () => null,
    );
    if (a?.blocked && Date.now() < end) {
      // màn đang trượt/mờ vào (hiệu ứng) → đợi rồi tính lại toạ độ
      await sleep(300);
      continue;
    }
    if (a) {
      await doAction(a);
      return a;
    }
    if (Date.now() > end) throw new Fail(`Không thấy "${what}" (${finder})`);
    await sleep(200);
  }
}
const tapText = (t, ms) => tapBy(`btn(${JSON.stringify(t)})`, t, ms);
const tapTextStarts = (t, ms) => tapBy(`btnStarts(${JSON.stringify(t)})`, t, ms);
const tapSel = (s, ms) => tapBy(`document.querySelector(${JSON.stringify(s)})`, s, ms);
/** Chạm phần tử bất kỳ (không phải <button>) có chữ đúng bằng `t` */
const tapAnyText = (sel, t, ms) =>
  tapBy(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => vis(e) && txt(e) === ${JSON.stringify(t)})`, t, ms);

async function waitFor(expr, what, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      last = await evaluate(inPage(`return (${expr});`));
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    if (Date.now() > end) throw new Fail(`Hết giờ chờ: ${what} (${JSON.stringify(last)?.slice(0, 200)})`);
    await sleep(200);
  }
}
const kindNow = () => evaluate(inPage('return screenKind();')).catch(() => 'loading');
const homeTitle = () => evaluate(inPage(`return txt(document.querySelector('.topbar-week'));`));
const appData = () => evaluate(`JSON.parse(localStorage.getItem('piano-be-9') || 'null')`);
async function gotoApp() {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#app > *')`, 'tải app', 20_000);
}
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

// ---------------- buổi học tự lái ----------------
const STUCK_MS = 90_000;
async function runSession(label, start) {
  const tStart = Date.now();
  if (start === 'next') await tapTextStarts('Học tiếp:');
  else await tapSel(`[data-lesson="${start}"]`);
  log(`  ▶ buổi ${label}`);
  const kinds = new Set();
  const seq = [];
  let lastSig = '';
  let sigSince = Date.now();
  let banner = '';
  const verdicts = { ok: 0, wrong: [] };
  let pendingAnswer = null;
  for (;;) {
    let d;
    try {
      d = await evaluate(inPage('return decide();'));
    } catch (e) {
      await sleep(300);
      if (Date.now() - sigSince > STUCK_MS) throw e;
      continue;
    }
    if (d.sig !== lastSig) {
      lastSig = d.sig;
      sigSince = Date.now();
      if (!kinds.has(d.kind)) {
        seq.push(d.kind);
        await shot(`${label}-${d.kind.replace(':', '_')}`);
      }
      kinds.add(d.kind);
    }
    if (d.answer) pendingAnswer = d.answer;
    else if (pendingAnswer && d.verdict) {
      if (d.verdict === 'ok') verdicts.ok++;
      else verdicts.wrong.push(pendingAnswer);
      pendingAnswer = null;
    }
    if (d.banner) banner = d.banner;
    if (d.home) break;
    if (Date.now() - sigSince > STUCK_MS) {
      await shot(`${label}-STUCK`);
      throw new Fail(`Buổi ${label} kẹt ở: ${d.sig}`);
    }
    if (Date.now() - tStart > 15 * 60_000) throw new Fail(`Buổi ${label} quá lâu (${d.sig})`);
    for (const a of d.actions) {
      await doAction(a);
      await sleep(60);
    }
    await sleep(d.actions.length ? 250 : 400);
  }
  const ms = Date.now() - tStart;
  log(`  ✓ buổi ${label} xong sau ${(ms / 1000).toFixed(0)}s — ${seq.join(' → ')}${banner ? ` — banner: ${banner}` : ''}`);
  await shot(`${label}-home`);
  const data = await appData();
  const last = data.sessions[data.sessions.length - 1];
  assert(!verdicts.wrong.length, `Buổi ${label}: đáp án đọc từ khuông bị chấm sai: ${verdicts.wrong.join(', ')}`);
  assert(last?.completed, `Buổi ${label} chưa được lưu là hoàn thành`);
  return { kinds, seq, banner, ms };
}

// ---------------- phụ huynh ----------------
async function holdParent(ms) {
  const a = await evaluate(inPage(`return target(document.querySelector('.parent-btn'), 'Phụ huynh');`));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await sleep(ms);
  await page.mouse.up();
}
async function openParent() {
  await waitFor(`!!document.querySelector('.parent-btn')`, 'nút Phụ huynh');
  await holdParent(500);
  await sleep(1800);
  assert((await kindNow()) === 'home', 'Nhấn 0,5 giây đã mở cổng phụ huynh');
  await holdParent(2300);
  await waitFor(`screenKind() === 'parent-gate'`, 'cổng phụ huynh sau khi giữ 2 giây');
  const q = await evaluate(inPage(`return txt(document.querySelector('.gate-q'));`));
  const mm = /(\d+)\s*×\s*(\d+)(?:\s*\+\s*(\d+))?/.exec(q);
  const m = mm ?? /(\d+)\s*\+\s*(\d+)/.exec(q);
  assert(m, `Không đọc được câu hỏi cổng: "${q}"`);
  const ans = String(mm ? Number(mm[1]) * Number(mm[2]) + Number(mm[3] ?? 0) : Number(m[1]) + Number(m[2]));
  for (const ch of ans) await tapBy(`[...document.querySelectorAll('.key-btn')].find((b) => txt(b) === ${JSON.stringify(ch)})`, `phím ${ch}`);
  await tapBy(`document.querySelector('.key-ok')`, 'OK');
  await waitFor(`screenKind() === 'parent'`, 'màn Phụ huynh');
}
async function openAdvanced() {
  const open = await evaluate(`!!document.querySelector('details.adv')?.open`);
  if (!open) await tapSel('details.adv > summary');
  await waitFor(`document.querySelector('details.adv')?.open`, 'mở Nâng cao');
}
async function backToKid() {
  await tapText('Về màn của bé');
  await waitFor(`screenKind() === 'home'`, 'về màn chính');
}
async function setWeek(week) {
  await openParent();
  await openAdvanced();
  const sel = await page.evaluateHandle(
    () => [...document.querySelectorAll('details.adv select')].find((s) => [...s.options].some((o) => o.value === '12')) ?? null,
  );
  assert(await sel.evaluate((s) => !!s), 'Không thấy ô chọn tuần');
  await sel.evaluate((s) => s.scrollIntoView({ block: 'center' }));
  // selectOption = chọn như người dùng (bắn input + change)
  await sel.asElement().selectOption(String(week));
  await sleep(300);
  if (await evaluate(`!!document.querySelector('.dialog-backdrop')`)) {
    await shot(`confirm-week-${week}`);
    await tapText(`Sang tuần ${week}`);
    await waitFor(`!document.querySelector('.dialog-backdrop')`, 'đóng hộp xác nhận đổi tuần');
  }
  await backToKid();
  const t = await homeTitle();
  assert(t.startsWith(`Tuần ${week} `), `Màn chính phải là Tuần ${week}, đang là "${t}"`);
}

// ---------------- kịch bản ----------------
const results = [];
async function scenario(id, name, fn) {
  if (!ONLY.includes(id)) return;
  currentScenario = id;
  const notes = [];
  const before = problems.length;
  const t = Date.now();
  log(`\n=== ${id}: ${name}`);
  let error = null;
  try {
    await fn(notes);
  } catch (e) {
    error = e instanceof Fail ? e.message : `${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`;
    log(`  ✗ ${error}`);
    await shot('FAIL');
  }
  const mine = problems.slice(before).filter((p) => !p.expected);
  if (!error && mine.length) error = `${mine.length} lỗi console/trang/mạng ngoài dự kiến`;
  results.push({ id, name, pass: !error, ms: Date.now() - t, notes, error });
  log(`=== ${id}: ${error ? 'HỎNG ✗' : 'ĐẠT ✓'} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}

async function main() {
  const build = join(OUT, 'build');
  if (!SKIP_BUILD) runBuild(build);
  else {
    assert(existsSync(join(ROOT, 'dist', 'index.html')), 'Chưa có dist/ — bỏ --skip-build');
    cpSync(join(ROOT, 'dist'), build, { recursive: true });
  }
  const port = await freePort();
  preview = await startPreview(build, port);
  APP_URL = preview.url;
  await launch();
  log(`${ENGINE} ${browser.version()} · app ${APP_URL} · ra ${OUT}`);
  await gotoApp();

  // ---------- P: dò tính năng ----------
  await scenario('P', 'Dò tính năng của trình duyệt', async (notes) => {
    const f = await evaluate(`(async () => {
      const r = {};
      r.ua = navigator.userAgent; r.maxTouchPoints = navigator.maxTouchPoints;
      r.fakeAudio = !!window.__fakeAudio;
      try {
        const C = window.AudioContext || window.webkitAudioContext;
        const c = new C(); await c.resume().catch(() => {});
        const a = c.currentTime; await new Promise((res) => setTimeout(res, 1000));
        r.audio = { ctor: window.AudioContext ? 'AudioContext' : 'webkitAudioContext', state: c.state, advanced: +(c.currentTime - a).toFixed(2), sampleRate: c.sampleRate,
          baseLatency: c.baseLatency ?? null, outputLatency: c.outputLatency ?? null };
        c.close();
      } catch (e) { r.audio = { error: String(e) }; }
      r.speech = 'speechSynthesis' in window;
      if (r.speech) {
        let v = speechSynthesis.getVoices();
        if (!v.length) await new Promise((res) => { const t = setTimeout(res, 1500); try { speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); res(); }, { once: true }); } catch { } });
        v = speechSynthesis.getVoices();
        r.voices = v.length; r.viVoices = v.filter((x) => /^vi/i.test(x.lang)).map((x) => x.name + ' ' + x.lang);
        r.speechAddEventListener = typeof speechSynthesis.addEventListener === 'function';
        r.utterance = await new Promise((res) => {
          try {
            const u = new SpeechSynthesisUtterance('Xin chào'); u.lang = 'vi-VN';
            const t = setTimeout(() => res('không có start/end sau 3 giây'), 3000);
            u.onstart = () => {}; u.onend = () => { clearTimeout(t); res('end'); }; u.onerror = (e) => { clearTimeout(t); res('error ' + (e.error || '')); };
            speechSynthesis.speak(u);
          } catch (e) { res('throw ' + e); }
        });
        speechSynthesis.cancel();
      }
      r.share = typeof navigator.share; r.canShare = typeof navigator.canShare;
      try { r.canShareFile = navigator.canShare ? navigator.canShare({ files: [new File(['x'], 'a.json', { type: 'application/json' })] }) : null; } catch (e) { r.canShareFile = 'throw ' + e; }
      r.clipboard = typeof navigator.clipboard?.writeText;
      r.getUserMedia = typeof navigator.mediaDevices?.getUserMedia;
      r.sw = 'serviceWorker' in navigator; r.caches = 'caches' in window;
      r.storagePersist = typeof navigator.storage?.persist;
      r.wakeLock = 'wakeLock' in navigator;
      r.vibrate = typeof navigator.vibrate;
      r.standalone = navigator.standalone ?? null;
      r.displayModeStandalone = matchMedia('(display-mode: standalone)').matches;
      const css = {};
      for (const [k, v] of Object.entries({
        has: 'selector(:has(a))', dvh: 'height: 100dvh', svh: 'height: 100svh', containerQueries: 'container-type: inline-size',
        colorMix: 'color: color-mix(in srgb, red, blue)', inset: 'inset: 0', aspectRatio: 'aspect-ratio: 1', gap: 'gap: 1px',
        backdrop: 'backdrop-filter: blur(2px)', webkitBackdrop: '-webkit-backdrop-filter: blur(2px)', touchAction: 'touch-action: manipulation',
        overscroll: 'overscroll-behavior: none', textWrapBalance: 'text-wrap: balance', nesting: 'selector(&)', lch: 'color: oklch(70% 0.1 200)',
        scrollbarGutter: 'scrollbar-gutter: stable', userSelect: 'user-select: none', webkitUserSelect: '-webkit-user-select: none',
        touchCallout: '-webkit-touch-callout: none', subgrid: 'grid-template-columns: subgrid',
      })) { try { css[k] = CSS.supports(v.startsWith('selector') ? v : '(' + v + ')'); } catch { css[k] = 'err'; } }
      r.css = css;
      await document.fonts.ready;
      r.fonts = [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/"/g, '') + ' ' + x.weight + ' ' + (x.unicodeRange || '').slice(0, 20));
      r.fontCheck = { baloo: document.fonts.check('700 20px "Baloo 2"', 'Đô Rê Mi ữ ặ ằ'), nunito: document.fonts.check('400 16px Nunito', 'Đô Rê Mi ữ ặ ằ') };
      return r;
    })()`);
    writeFileSync(join(OUT, 'features.json'), JSON.stringify(f, null, 2));
    notes.push(`AudioContext: ${f.fakeAudio ? 'KHÔNG CÓ sẵn → dùng AudioContext GIẢ (im lặng) của kịch bản · ' : ''}${JSON.stringify(f.audio)}`);
    if (f.fakeAudio) finding('Trình duyệt này không có Web Audio (window.AudioContext/webkitAudioContext đều undefined) — đã cài AudioContext giả để lái UI');
    notes.push(`speechSynthesis: ${f.speech} · giọng: ${f.voices} (vi: ${f.viVoices?.join(', ') || 'không'}) · nói thử: ${f.utterance} · addEventListener: ${f.speechAddEventListener}`);
    notes.push(`share=${f.share} canShare=${f.canShare} canShare(file)=${f.canShareFile} clipboard.writeText=${f.clipboard} getUserMedia=${f.getUserMedia} SW=${f.sw} wakeLock=${f.wakeLock} vibrate=${f.vibrate}`);
    const noCss = Object.entries(f.css).filter(([, v]) => v !== true).map(([k]) => k);
    notes.push(`CSS không hỗ trợ: ${noCss.join(', ') || '(không)'}`);
    notes.push(`Font đã nạp: ${f.fonts.length} mặt (${[...new Set(f.fonts.map((x) => x.split(' ')[0]))].join(', ')}); check Baloo=${f.fontCheck.baloo} Nunito=${f.fontCheck.nunito}`);
    if (f.audio?.advanced !== undefined && f.audio.advanced < 0.5) finding(`AudioContext không chạy ở chế độ ngầm (state=${f.audio.state}, chạy ${f.audio.advanced}s/1s)`);
    // Mẫu chữ tiếng Việt có dấu với 2 font của app
    await evaluate(`(() => {
      const d = document.createElement('div'); d.id = 'wk-fontprobe';
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;color:#222;padding:24px;font-size:30px;line-height:1.5';
      const s = 'Đô Rê Mi Fa Sol La Si · Ữ ặ ằ ẵ ẳ ỡ ỷ ự ố · Học tiếp: Bàn tay xinh 🎹🎵👪🇻🇳⭐🏆🎉';
      d.innerHTML = '<div style="font-family:\\'Baloo 2\\';font-weight:700">' + s + '</div><div style="font-family:\\'Baloo 2\\';font-weight:500">' + s + '</div>' +
        '<div style="font-family:Nunito;font-weight:400">' + s + '</div><div style="font-family:Nunito;font-weight:800">' + s + '</div>' +
        '<div style="font-family:serif">' + s + ' (serif — đối chứng)</div>';
      document.body.append(d);
    })()`);
    await sleep(500);
    await shot('font-probe');
    await evaluate(`document.getElementById('wk-fontprobe').remove()`);
  });

  // ---------- A ----------
  await scenario('A', 'Bắt đầu → Hướng dẫn → màn chính → một buổi tuần 1 trọn vẹn', async (notes) => {
    await waitFor(`screenKind() === 'start'`, 'màn Bắt đầu');
    await shot('start');
    await tapText('Bắt đầu');
    await waitFor(`screenKind() === 'onboarding'`, 'Hướng dẫn (lần đầu)');
    let cards = 0;
    for (let i = 0; i < 8; i++) {
      const step = await evaluate(inPage(`return txt(document.querySelector('.onb-step'));`));
      cards++;
      await shot(`onboarding-${step.replace('/', 'of')}`);
      if (await evaluate(inPage(`return !!btn('Bắt đầu học');`))) {
        await tapText('Bắt đầu học');
        break;
      }
      await tapText('Tiếp');
      await waitFor(`txt(document.querySelector('.onb-step')) !== ${JSON.stringify(step)}`, 'sang thẻ kế');
    }
    await waitFor(`screenKind() === 'home'`, 'màn chính sau Hướng dẫn');
    const title = await homeTitle();
    assert(title.startsWith('Tuần 1 '), `Màn chính phải là Tuần 1: "${title}"`);
    await shot('home-first');
    notes.push(`Hướng dẫn ${cards} thẻ; màn chính "${title}"`);
    const s = await runSession('w1-1', 'next');
    notes.push(`Buổi 1: ${s.seq.join(' → ')} (${(s.ms / 1000).toFixed(0)}s)`);
    const done = await evaluate(`document.querySelectorAll('.lesson-row.is-done').length`);
    assert(done >= 1, 'Màn chính chưa đánh dấu bài 1 đã học');
  });

  // ---------- C ----------
  await scenario('C', 'Thư viện, bài hát, sticker, phụ huynh, soạn bài, đàn tự do', async (notes) => {
    await gotoApp();
    await toHome();
    // Tuần 1 khóa hết bài hát → lên tuần 2 để có bài mở
    if ((await homeTitle()).startsWith('Tuần 1 ')) await setWeek(2);
    await tapText('Bài hát');
    await waitFor(`screenKind() === 'library'`, 'Thư viện');
    await shot('library');
    await tapBy(`[...document.querySelectorAll('.lib-filter button')].find((b) => txt(b).startsWith('🇻🇳'))`, '🇻🇳 Bài Việt Nam');
    await waitFor(`document.querySelector('.lib-filter button.on') && txt(document.querySelector('.lib-filter button.on')).startsWith('🇻🇳')`, 'lọc 🇻🇳');
    await shot('library-vn');
    const vnCards = await evaluate(`document.querySelectorAll('.song-card').length`);
    notes.push(`Thư viện lọc 🇻🇳: ${vnCards} thẻ`);
    await tapBy(`[...document.querySelectorAll('.lib-filter button')].find((b) => txt(b).startsWith('🎵'))`, '🎵 Tất cả');
    await sleep(300);
    await tapSel('.song-card:not(.locked)');
    await waitFor(`screenKind() === 'song'`, 'màn bài hát');
    const songTitle = await evaluate(inPage(`return txt(document.querySelector('.song-title'));`));
    await shot('song');
    await tapText('Xem mẫu');
    const started = await waitFor(`!!btn('Dừng')`, 'đang xem mẫu', 8000).catch(() => false);
    await sleep(2500);
    await shot('song-demo');
    let ended = false;
    if (started) {
      ended = await waitFor(`!!btn('Xem mẫu')`, 'xem mẫu tự kết thúc', 45_000).catch(() => false);
      if (!ended) await tapText('Dừng');
    }
    notes.push(`Bài "${songTitle}": Xem mẫu ${!started ? 'KHÔNG bắt đầu' : ended ? 'tự chạy hết' : 'phải bấm Dừng (đồng hồ âm thanh không chạy?)'}`);
    if (started && !ended) finding('Xem mẫu không tự kết thúc trong 45 giây (phụ thuộc đồng hồ AudioContext)');
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'library'`, 'về Thư viện');
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'home'`, 'về màn chính');

    await tapText('Sticker');
    await waitFor(`screenKind() === 'stickers'`, 'Sổ sticker');
    await shot('stickers');
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'home'`, 'về màn chính từ sticker');

    // Phụ huynh
    await openParent();
    await shot('parent');
    await openAdvanced();
    await shot('parent-advanced');
    await tapText('Sao lưu dữ liệu');
    const msg = await waitFor(`[...document.querySelectorAll('.banner')].map(txt).find((t) => /^[✅❌]/.test(t)) || ''`, 'thông báo sao lưu', 15_000).catch(
      (e) => `(không có thông báo: ${e.message})`,
    );
    await shot('parent-backup');
    notes.push(`💾 Sao lưu dữ liệu → "${msg}"`);
    if (String(msg).startsWith('❌')) finding(`Sao lưu báo lỗi: ${msg}`);
    assert((await kindNow()) === 'parent', 'Sao lưu làm rời màn Phụ huynh');
    // Nút nhanh 💾 Sao lưu ở đầu màn (nếu có)
    const quick = await evaluate(inPage(`return !!btn('Sao lưu');`));
    if (quick) {
      await tapText('Sao lưu');
      await sleep(1500);
      notes.push(`💾 Sao lưu (nút nhanh): "${await evaluate(inPage(`return [...document.querySelectorAll('.banner')].map(txt).filter((t) => /^[✅❌]/.test(t)).pop() || ''`))}"`);
    }
    // 📊 Báo cáo
    await tapText('Báo cáo');
    await sleep(1500);
    await shot('report');
    const rep = await evaluate(inPage(`return { canvas: document.querySelectorAll('canvas').length, imgs: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0).length,
      btns: buttons().map(label).join('|') }`));
    notes.push(`📊 Báo cáo: ${rep.canvas} canvas, ${rep.imgs} ảnh đã vẽ; nút: ${rep.btns}`);
    if (await evaluate(inPage(`return !!btn('Chia sẻ');`))) {
      await tapText('Chia sẻ');
      const toastTxt = await waitFor(`txt(document.querySelector('.toast.show')) || ''`, 'thông báo chia sẻ', 5000).catch(() => '');
      notes.push(`📊 Chia sẻ (navigator.share ${(await evaluate(`typeof navigator.share`)) === 'function' ? 'có' : 'KHÔNG có → tải ảnh'}): toast "${toastTxt}"`);
      await sleep(1000);
      await shot('report-share');
    }
    await tapText('Quay lại').catch(() => tapTextStarts('←'));
    await waitFor(`screenKind() === 'parent'`, 'về Phụ huynh từ Báo cáo');
    // 🎤 Cài micro (3 bước)
    await tapBy(`btn('Bắt đầu cài micro') || btn('Cài micro (3 bước)') || btn('Thử / chỉnh micro')`, 'Cài micro');
    await waitFor(`!document.querySelector('.parent-head')`, 'rời màn Phụ huynh sang màn micro', 8000);
    await sleep(1200);
    await shot('mictest');
    const mic = await evaluate(inPage(`return buttons().map(label).join('|')`));
    notes.push(`🎤 Màn cài micro: nút ${mic}`);
    // Thử bước 1 (cho phép micro) — WebKit ngầm không có thiết bị: xem app báo gì
    if (await evaluate(inPage(`return !!btnStarts('1. Cho phép');`))) {
      await tapTextStarts('1. Cho phép');
      await sleep(3000);
      await shot('mictest-step1');
      notes.push(`🎤 Bước 1 → "${await evaluate(inPage(`return txt(document.querySelector('.screen')).slice(0, 220)`))}"`);
    }
    await tapText('Quay lại').catch(() => tapTextStarts('←'));
    await waitFor(`screenKind() === 'parent'`, 'về Phụ huynh từ micro', 10_000).catch(async () => {
      await shot('mictest-back-stuck');
      throw new Fail('Không về được màn Phụ huynh từ màn micro');
    });
    // Soạn bài
    await tapText('Thêm bài hát');
    await waitFor(`!!document.querySelector('.se-area')`, 'màn soạn bài');
    await shot('editor-empty');
    await page.locator('.se-area').tap().catch(() => page.locator('.se-area').click());
    await page.keyboard.type('Đô Rê Mi- | Mi/ Fa/ Sol-', { delay: 15 });
    await sleep(800);
    const ed = await evaluate(`(() => { const s = document.querySelector('.se-staff-slot svg, .se-staff svg'); return { svg: !!s, heads: s ? s.querySelectorAll('[data-e2e-pitch], .nh, ellipse, use').length : 0,
      w: s ? Math.round(s.getBoundingClientRect().width) : 0, h: s ? Math.round(s.getBoundingClientRect().height) : 0,
      errs: [...document.querySelectorAll('.se-err')].map((e) => e.textContent.trim()), ok: document.querySelector('.se-ok')?.textContent.trim() ?? '',
      value: document.querySelector('.se-area').value }; })()`);
    await shot('editor-typed');
    notes.push(`Soạn bài: ô chữ "${ed.value}" → khuông svg=${ed.svg} ${ed.w}×${ed.h}, ${ed.heads} phần tử nốt; lỗi: ${ed.errs.join(' / ') || 'không'}; ${ed.ok}`);
    assert(ed.value === 'Đô Rê Mi- | Mi/ Fa/ Sol-', `Ô chữ nhận sai nội dung: "${ed.value}"`);
    assert(ed.svg && ed.w > 50, 'Khuông nhạc không hiện sau khi gõ');
    await tapText('Quay lại').catch(() => tapTextStarts('←'));
    await sleep(500);
    if (await evaluate(`!!document.querySelector('.dialog-backdrop')`)) {
      await shot('editor-discard');
      await tapBy(`[...document.querySelector('.dialog-backdrop').querySelectorAll('button')].find((b) => label(b) !== 'Hủy')`, 'bỏ bài');
    }
    await waitFor(`screenKind() === 'parent'`, 'về Phụ huynh từ soạn bài');
    await backToKid();

    // Đàn tự do + trò Đàn theo thầy
    await tapText('Đàn tự do');
    await waitFor(`!!document.querySelector('.echo-box')`, 'màn Đàn tự do');
    await tapBy(`keyFor('E4')`, 'phím E4');
    await sleep(300);
    const fp = await evaluate(inPage(`return txt(document.querySelector('.note-big')) + ' · ' + txt(document.querySelector('.finger-big'))`));
    await shot('freeplay');
    notes.push(`Đàn tự do: chạm E4 → "${fp}"`);
    await tapText('Đàn theo thầy');
    const listening = await waitFor(`/Đến lượt con/.test(txt(document.querySelector('.echo-msg')))`, 'thầy đàn xong', 15_000).catch(() => false);
    await shot('echo');
    if (listening) {
      // Đọc chuỗi nốt thầy vừa đàn từ phím sáng không khả thi → đàn đại một phím, chờ phản hồi
      await tapBy(`keyFor('C4')`, 'phím C4');
      await sleep(600);
      notes.push(`🎵 Đàn theo thầy: lượt bé OK → "${await evaluate(inPage(`return txt(document.querySelector('.echo-msg'))`))}"`);
      await shot('echo-answer');
    } else {
      notes.push('🎵 Đàn theo thầy: KHÔNG tới lượt bé trong 15 giây');
      finding('Trò Đàn theo thầy không chuyển sang lượt bé (playSequence/đồng hồ âm thanh?)');
    }
    await tapText('Dừng trò').catch(() => undefined);
    await tapText('Quay lại');
    await waitFor(`screenKind() === 'home'`, 'về màn chính từ Đàn tự do');
  });

  // ---------- B ----------
  await scenario('B', `Đổi tuần ${WEEKS.join('/')} → mỗi tuần một buổi`, async (notes) => {
    await gotoApp();
    await toHome();
    for (const w of WEEKS) {
      await setWeek(w);
      const s = await runSession(`w${w}`, 'next');
      notes.push(`Tuần ${w}: ${s.seq.join(' → ')} (${(s.ms / 1000).toFixed(0)}s)`);
    }
  });

  // ---------- D ----------
  await scenario('D', 'Service worker + offline', async (notes) => {
    await gotoApp();
    const sw = await waitFor(
      `navigator.serviceWorker && navigator.serviceWorker.getRegistration().then((r) => r && r.active && navigator.serviceWorker.controller ? { state: r.active.state, url: r.active.scriptURL } : null)`,
      'service worker active + điều khiển trang',
      30_000,
    ).catch(async (e) => {
      const st = await evaluate(`navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then((r) => r ? { active: !!r.active, installing: !!r.installing, waiting: !!r.waiting, ctrl: !!navigator.serviceWorker.controller } : 'chưa đăng ký') : 'không có navigator.serviceWorker'`).catch(() => '?');
      finding(`Service worker không điều khiển trang: ${JSON.stringify(st)}`);
      throw e;
    });
    const keys = await evaluate(`caches.keys().then((k) => k.join(','))`);
    notes.push(`SW ${sw.state} ${sw.url}; cache: ${keys}`);
    await toHome();
    const before = await homeTitle();
    expectNetFailures = true;
    await preview.stop(); // máy chủ tắt hẳn
    await context.setOffline(true);
    try {
      try {
        await page.reload({ waitUntil: 'load', timeout: 20_000 });
      } catch (e) {
        // Playwright-WebKit: context.setOffline + điều hướng do SW phục vụ → "internal error". Thử lại chỉ với máy chủ tắt.
        finding(`Tải lại khi context.setOffline(true) hỏng: ${e.message.split('\n')[0]} → thử lại với mạng "bật" nhưng máy chủ đã tắt`);
        await context.setOffline(false);
        await page.goto(APP_URL, { waitUntil: 'load', timeout: 20_000 });
      }
      await waitFor(`!!document.querySelector('#app > *')`, 'app mở khi offline', 20_000);
      await shot('offline-start');
      await toHome();
      const after = await homeTitle();
      await shot('offline-home');
      notes.push(`Offline reload: "${after}" (trước: "${before}")`);
      assert(after === before, 'Dữ liệu khác sau tải lại offline');
    } finally {
      await context.setOffline(false);
    }
  });
}

let fatal = null;
try {
  await main();
} catch (e) {
  fatal = e;
  log(`LỖI NGHIÊM TRỌNG: ${e.stack ?? e.message}`);
}
await browser?.close().catch(() => undefined);
await preview?.stop().catch(() => undefined);

const summary = {
  when: new Date().toISOString(),
  engine: ENGINE,
  out: OUT,
  scenarios: results,
  findings,
  problems,
  warnings,
  blockedTaps,
  fatal: fatal ? String(fatal.stack ?? fatal) : null,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, 'webkit.log'), logLines.join('\n'));
console.log(`\n================ KẾT QUẢ (${ENGINE}) ================`);
for (const r of results) {
  console.log(`${r.pass ? '✓ ĐẠT ' : '✗ HỎNG'}  ${r.id}  ${r.name}  (${(r.ms / 1000).toFixed(0)}s)`);
  for (const n of r.notes) console.log(`        · ${n}`);
  if (r.error) console.log(`        ✗ ${r.error}`);
}
for (const f of findings) console.log(`◆ [${f.scenario}] ${f.text}`);
const unexpected = problems.filter((p) => !p.expected);
console.log(`Lỗi ngoài dự kiến: ${unexpected.length} · cảnh báo: ${warnings.length} · chạm bị che: ${blockedTaps}`);
for (const p of unexpected.slice(0, 25)) console.log(`   [${p.scenario}] ${p.kind}: ${p.text.split('\n')[0]}`);
console.log(`Ảnh + log + summary.json: ${OUT}`);
process.exit(fatal || results.some((r) => !r.pass) || !results.length ? 1 : 0);
